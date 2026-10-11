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
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { noteNameToMidi, vlq, buildMidiFile };
}
