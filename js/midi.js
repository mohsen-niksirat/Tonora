/* Tonora — Standard MIDI File (SMF, format 0) encoder for the composer.
   Pure and dependency-free so it can be unit-tested in Node. */
'use strict';

const MIDI_NOTE_OFFSET = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function noteNameToMidi(note) {
  const m = /^([A-G]#?)(-?\d)$/.exec(note);
  if (!m) return null;
  return MIDI_NOTE_OFFSET[m[1]] + (parseInt(m[2], 10) + 1) * 12;
}

/* variable-length quantity */
function vlq(value) {
  const bytes = [value & 0x7f];
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

/* GM drum map */
const DRUM_NOTE = { kick: 36, snare: 38, hat: 42 };
const PRIO = { meta: 0, off: 1, on: 2 };

function buildMidiFile(tracks, bpm, steps, swing) {
  const PPQ = 480;
  const stepTicks = PPQ / 4; // sixteenth note
  const events = [];
  const push = (tick, bytes, prio) => events.push({ tick, prio, bytes });

  const usPerQuarter = Math.round(60000000 / Math.max(1, bpm));
  push(0, [0xFF, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff], PRIO.meta);
  push(0, [0xC0, 0], PRIO.meta);   // ch0 melody → acoustic grand
  push(0, [0xC1, 38], PRIO.meta);  // ch1 bass → synth bass 1

  const vel = Math.max(1, Math.min(127, Math.round((tracks.velocity !== undefined ? tracks.velocity : 0.8) * 127)));

  let cursor = 0;
  for (let s = 0; s < steps; s++) {
    let dur = stepTicks;
    if (swing) dur *= (s % 2 === 0) ? 1.33 : 0.67;
    const start = cursor;
    cursor += dur;

    const mel = tracks.melody && tracks.melody[s];
    if (mel) {
      (Array.isArray(mel) ? mel : [mel]).forEach(n => {
        const nn = noteNameToMidi(n);
        if (nn == null) return;
        push(start, [0x90, nn, vel], PRIO.on);
        push(start + Math.round(dur * 2), [0x80, nn, 0], PRIO.off);
      });
    }
    const bass = tracks.bass && tracks.bass[s];
    if (bass) {
      (Array.isArray(bass) ? bass : [bass]).forEach(n => {
        const nn = noteNameToMidi(n);
        if (nn == null) return;
        push(start, [0x91, nn, vel], PRIO.on);
        push(start + Math.round(dur * 3), [0x81, nn, 0], PRIO.off);
      });
    }
    const d = tracks.drums;
    if (d) {
      const hit = (name) => {
        const nn = DRUM_NOTE[name];
        if (nn == null) return;
        push(start, [0x99, nn, vel], PRIO.on);
        push(start + Math.round(stepTicks / 2), [0x89, nn, 0], PRIO.off);
      };
      if (d[s] === true) {
        // back-compat: single boolean drum lane
        hit(s % 8 === 0 ? 'kick' : (s % 4 === 2 ? 'snare' : 'hat'));
      } else if (typeof d === 'object' && !Array.isArray(d)) {
        if (d.kick && d.kick[s]) hit('kick');
        if (d.snare && d.snare[s]) hit('snare');
        if (d.hat && d.hat[s]) hit('hat');
      }
    }
  }

  events.sort((a, b) => a.tick - b.tick || a.prio - b.prio);

  const trackBytes = [];
  let last = 0;
  for (const e of events) {
    trackBytes.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  trackBytes.push(...vlq(0), 0xFF, 0x2F, 0x00); // end of track

  const header = [
    0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1,
    (PPQ >> 8) & 0xff, PPQ & 0xff
  ];
  const len = trackBytes.length;
  const trkHeader = [0x4D, 0x54, 0x72, 0x6B, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff];
  return new Uint8Array([...header, ...trkHeader, ...trackBytes]);
}

if (typeof window !== 'undefined') window.buildMidiFile = buildMidiFile;

/* ---- SMF parser (format 0/1) → note events ---------------------------- */
function readVarLen(data, pos) {
  let value = 0, b;
  do { b = data[pos++]; value = (value << 7) | (b & 0x7f); } while (b & 0x80);
  return { value, pos };
}

const MIDI_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiToNoteName(midi) {
  return MIDI_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

function parseMidiFile(input) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  let pos = 0;
  const readStr = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(data[pos++]); return s; };
  const read32 = () => { const v = ((data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3]) >>> 0; pos += 4; return v; };
  const read16 = () => { const v = (data[pos] << 8) | data[pos + 1]; pos += 2; return v; };

  if (readStr(4) !== 'MThd') throw new Error('Not a MIDI file');
  const hlen = read32();
  const format = read16();
  const ntrks = read16();
  const division = read16();
  pos += Math.max(0, hlen - 6);

  const notes = [];
  let bpm = 120;
  for (let t = 0; t < ntrks && pos + 8 <= data.length; t++) {
    const id = readStr(4);
    const len = read32();
    const end = pos + len;
    if (id !== 'MTrk') { pos = end; continue; }
    let tick = 0;
    let running = 0;
    const open = new Map();
    while (pos < end) {
      const dv = readVarLen(data, pos); pos = dv.pos; tick += dv.value;
      let status = data[pos];
      if (status & 0x80) { running = status; pos++; } else { status = running; }
      const cmd = status & 0xf0, ch = status & 0x0f;
      if (status === 0xFF) {
        const type = data[pos++];
        const ml = readVarLen(data, pos); pos = ml.pos;
        if (type === 0x51 && ml.value === 3) {
          const us = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2];
          bpm = Math.round(60000000 / us);
        }
        pos += ml.value;
      } else if (status === 0xF0 || status === 0xF7) {
        const ml = readVarLen(data, pos); pos = ml.pos; pos += ml.value;
      } else if (cmd === 0x90 || cmd === 0x80) {
        const note = data[pos++]; const vel = data[pos++];
        const key = ch * 128 + note;
        if (cmd === 0x90 && vel > 0) {
          const idx = notes.length;
          notes.push({ channel: ch, midi: note, startTick: tick, endTick: tick, velocity: vel });
          open.set(key, idx);
        } else {
          const idx = open.get(key);
          if (idx !== undefined) { notes[idx].endTick = tick; open.delete(key); }
        }
      } else if (cmd === 0xC0 || cmd === 0xD0) { pos += 1; }
      else if (cmd === 0xA0 || cmd === 0xB0 || cmd === 0xE0) { pos += 2; }
      else { pos++; }
    }
    pos = end;
  }
  return { format, division: division || 480, bpm, notes };
}

/* Map parsed MIDI onto the composer's fixed 16th-note grid. */
function midiToTracks(input, steps) {
  const parsed = parseMidiFile(input);
  const ppq = parsed.division || 480;
  const stepTicks = ppq / 4;
  const melody = new Array(steps).fill(null);
  const bass = new Array(steps).fill(null);
  const drums = { kick: new Array(steps).fill(false), snare: new Array(steps).fill(false), hat: new Array(steps).fill(false) };
  const put = (arr, s, n) => {
    const cur = arr[s];
    if (cur === null) arr[s] = n;
    else if (Array.isArray(cur)) { if (!cur.includes(n)) cur.push(n); }
    else if (cur !== n) arr[s] = [cur, n];
  };
  parsed.notes.forEach(ev => {
    const s = Math.round(ev.startTick / stepTicks);
    if (s < 0 || s >= steps) return;
    if (ev.channel === 9) {
      if (ev.midi === 36 || ev.midi === 35) drums.kick[s] = true;
      else if (ev.midi === 38 || ev.midi === 40) drums.snare[s] = true;
      else if (ev.midi === 42 || ev.midi === 44) drums.hat[s] = true;
    } else if (ev.channel === 1) {
      put(bass, s, midiToNoteName(ev.midi));
    } else {
      put(melody, s, midiToNoteName(ev.midi));
    }
  });
  return { bpm: parsed.bpm, steps, tracks: { melody, bass, drums } };
}

if (typeof window !== 'undefined') window.midiToTracks = midiToTracks;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { noteNameToMidi, vlq, buildMidiFile, parseMidiFile, midiToTracks, midiToNoteName };
}