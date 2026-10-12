const assert = require('assert');

// Load the REAL audio engine logic (pure helpers) instead of re-implementing it.
const { noteToFreq, NOTE_OFFSET, audioBufferToWav } = require('../js/audio.js');
const { noteNameToMidi, vlq, buildMidiFile } = require('../js/midi.js');
const { parseMidiFile, midiToTracks, midiToNoteName } = require('../js/midi.js');
const { buildBacking, pcToNote, inferKeyRoot, pcOf } = require('../js/backing.js');
const { expectedFor, validateAnswer, scaleNotes, chordNotes, noteTranspose, THEORY_LESSONS } = require('../js/theory-content.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

test('A4 is 440Hz', () => {
  assert.strictEqual(noteToFreq('A4'), 440);
});

test('A3 is 220Hz (octave below)', () => {
  assert.ok(Math.abs(noteToFreq('A3') - 220) < 0.001, `got ${noteToFreq('A3')}`);
});

test('C4 is ~261.63Hz', () => {
  assert.ok(Math.abs(noteToFreq('C4') - 261.625565) < 0.01, `got ${noteToFreq('C4')}`);
});

test('sharps are one semitone above their natural', () => {
  const ratio = noteToFreq('C#4') / noteToFreq('C4');
  assert.ok(Math.abs(ratio - Math.pow(2, 1 / 12)) < 1e-9);
});

test('NOTE_OFFSET covers all twelve pitch classes', () => {
  assert.strictEqual(Object.keys(NOTE_OFFSET).length, 12);
});

test('invalid note falls back to 440Hz', () => {
  assert.strictEqual(noteToFreq('H9'), 440);
});

test('noteToFreq supports Persian Koron and Sori microtones', () => {
  const e4 = noteToFreq('E4');
  const ep4 = noteToFreq('Ep4');
  const eb4 = noteToFreq('Eb4');
  assert.ok(ep4 > eb4 && ep4 < e4, 'Ep4 should lie between Eb4 and E4');
  const quarterRatio = Math.pow(2, 0.5 / 12);
  assert.ok(Math.abs(e4 / ep4 - quarterRatio) < 1e-6);
  assert.ok(Math.abs(ep4 / eb4 - quarterRatio) < 1e-6);

  const f4 = noteToFreq('F4');
  const fs4 = noteToFreq('F>4');
  assert.ok(Math.abs(fs4 / f4 - quarterRatio) < 1e-6);
});

test('audioBufferToWav writes a valid RIFF/WAVE header', () => {
  const frames = 100;
  const fakeBuffer = {
    numberOfChannels: 1,
    length: frames,
    sampleRate: 44100,
    getChannelData: () => new Float32Array(frames).fill(0.5)
  };
  const blob = audioBufferToWav(fakeBuffer);
  assert.strictEqual(blob.type, 'audio/wav');
  // 44-byte header + 100 frames * 1 channel * 2 bytes
  assert.strictEqual(blob.size, 44 + frames * 2);
});

test('noteNameToMidi maps A4 to 69 and C#4 to 61', () => {
  assert.strictEqual(noteNameToMidi('A4'), 69);
  assert.strictEqual(noteNameToMidi('C#4'), 61);
  assert.strictEqual(noteNameToMidi('nope'), null);
});

test('vlq encodes values across the 7-bit boundary', () => {
  assert.deepStrictEqual(vlq(0), [0]);
  assert.deepStrictEqual(vlq(127), [127]);
  assert.deepStrictEqual(vlq(128), [0x81, 0x00]);
});

test('buildMidiFile emits valid MThd/MTrk chunks', () => {
  const bytes = buildMidiFile(
    { melody: ['C4', null], bass: [null, 'C3'], drums: [true, false], velocity: 0.8 },
    120, 2, false
  );
  assert.ok(bytes instanceof Uint8Array);
  assert.strictEqual(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
  assert.strictEqual(String.fromCharCode(...bytes.slice(14, 18)), 'MTrk');
});

test('pcOf parses naturals and accidentals', () => {
  assert.strictEqual(pcOf('C4'), 0);
  assert.strictEqual(pcOf('F#3'), 6);
  assert.strictEqual(pcOf('Bb2'), 10);
});

test('inferKeyRoot detects C major from a C-major melody', () => {
  const melody = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  assert.strictEqual(inferKeyRoot(melody.map(pcOf)), 0);
});

test('buildBacking yields one bar per measure with a valid triad', () => {
  const song = {
    notes: [
      { n: 'C4', t: 0, d: 1 }, { n: 'E4', t: 1, d: 1 }, { n: 'G4', t: 2, d: 1 }, { n: 'C5', t: 3, d: 1 },
      { n: 'F4', t: 4, d: 1 }, { n: 'A4', t: 5, d: 1 }, { n: 'C5', t: 6, d: 1 }, { n: 'F4', t: 7, d: 1 }
    ]
  };
  const { key, bars } = buildBacking(song);
  assert.strictEqual(key, 0);
  assert.strictEqual(bars.length, 2);
  assert.ok(bars.every(b => b.triad.length === 3 && b.startBeat % 4 === 0));
});

test('pcToNote wraps octaves correctly', () => {
  assert.strictEqual(pcToNote(0, 3), 'C3');
  assert.strictEqual(pcToNote(11, 2), 'B2');
  assert.strictEqual(pcToNote(12, 4), 'C4');
});

test('midiToNoteName maps numbers to names', () => {
  assert.strictEqual(midiToNoteName(60), 'C4');
  assert.strictEqual(midiToNoteName(69), 'A4');
});

test('buildMidiFile → parseMidiFile round-trips note events', () => {
  const tracks = {
    melody: ['C4', null, 'E4', null],
    bass: [null, 'C3', null, null],
    drums: { kick: [true, false, false, false], snare: [false, false, false, false], hat: [false, true, false, true] },
    velocity: 0.8
  };
  const bytes = buildMidiFile(tracks, 120, 4, false);
  const parsed = parseMidiFile(bytes);
  assert.strictEqual(parsed.bpm, 120);
  assert.strictEqual(parsed.division, 480);
  // 2 melodic + 1 bass + 3 drum note-ons
  const ons = parsed.notes.length;
  assert.strictEqual(ons, 6);
  const back = midiToTracks(bytes, 4);
  assert.strictEqual(back.tracks.melody[0], 'C4');
  assert.strictEqual(back.tracks.melody[2], 'E4');
  assert.strictEqual(back.tracks.bass[1], 'C3');
  assert.strictEqual(back.tracks.drums.kick[0], true);
  assert.strictEqual(back.tracks.drums.hat[1], true);
  assert.strictEqual(back.tracks.drums.hat[3], true);
});

test('chordNotes builds a C major triad', () => {
  assert.deepStrictEqual(chordNotes('C4', 'maj'), ['C4', 'E4', 'G4']);
  assert.deepStrictEqual(chordNotes('A3', 'min'), ['A3', 'C4', 'E4']);
});

test('noteTranspose moves a perfect fifth up', () => {
  assert.strictEqual(noteTranspose('C4', '5P'), 'G4');
});

test('scaleNotes returns the seven C-major notes in order', () => {
  assert.deepStrictEqual(scaleNotes('C major', 3), ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3']);
});

test('validateAnswer accepts the correct chord and rejects wrong notes', () => {
  const lesson = { type: 'chord', quality: 'maj' };
  assert.strictEqual(validateAnswer(lesson, { root: 'C4' }, ['C4', 'E4', 'G4']).correct, true);
  assert.strictEqual(validateAnswer(lesson, { root: 'C4' }, ['C4', 'E4']).correct, false);
  assert.strictEqual(validateAnswer(lesson, { root: 'C4' }, ['C4', 'E4', 'G4', 'B4']).correct, false);
});

test('expectedFor resolves an interval question', () => {
  const lesson = { type: 'interval', root: 'C4' };
  assert.deepStrictEqual(expectedFor(lesson, { interval: '3M' }), ['E4']);
});

test('ear lessons resolve both interval and chord choices', () => {
  const interval = { type: 'ear', kind: 'interval', roots: ['C4'], pool: ['3M'] };
  assert.deepStrictEqual(expectedFor(interval, { root: 'C4', choice: '3M' }), ['C4', 'E4']);
  assert.deepStrictEqual(expectedFor(interval, { root: 'F4', choice: '5P' }), ['F4', 'C5']);
  const chord = { type: 'ear', kind: 'chord', roots: ['A3'], pool: ['min'] };
  assert.deepStrictEqual(expectedFor(chord, { root: 'A3', choice: 'min' }), ['A3', 'C4', 'E4']);
  assert.deepStrictEqual(expectedFor(chord, { root: 'C4', choice: 'maj' }), ['C4', 'E4', 'G4']);
});

test('every curriculum lesson has a resolvable answer', () => {
  const sampleFor = l => {
    if (l.type === 'note') return l.pool[0];
    if (l.type === 'interval') return { interval: l.intervals[0] };
    if (l.type === 'chord') return { root: l.roots[0] };
    if (l.type === 'scale') return {};
    if (l.type === 'ear') return { root: l.roots[0], choice: l.pool[0] };
    return {};
  };
  THEORY_LESSONS.forEach(l => {
    const got = expectedFor(l, sampleFor(l));
    assert.ok(got.length > 0, `no answer for lesson ${l.id}`);
    got.forEach(n => assert.ok(/^[A-G][#b]?-?\d$/.test(n), `bad note ${n} in ${l.id}`));
  });
  const earIds = THEORY_LESSONS.filter(l => l.type === 'ear').map(l => l.id);
  assert.ok(earIds.includes('ear-intervals') && earIds.includes('ear-chords'), 'ear lessons missing');
});

test('noteTranspose accurately handles octave jumps (8P and wrapping)', () => {
  assert.strictEqual(noteTranspose('C4', '8P'), 'C5');
  assert.strictEqual(noteTranspose('G4', '6M'), 'E5');
});

test('chordNotes builds 7th and sus4 chords', () => {
  const c7 = chordNotes('C4', '7');
  assert.ok(c7.includes('C4') && c7.includes('E4') && c7.includes('G4'));
  assert.ok(c7.includes('Bb4') || c7.includes('A#4'));
  const csus4 = chordNotes('C4', 'sus4');
  assert.deepStrictEqual(csus4, ['C4', 'F4', 'G4']);
});

test('buildMidiFile honors muted and solo track states', () => {
  const tracks = {
    melody: ['C4', null],
    bass: [null, 'C3'],
    drums: { kick: [true, false], snare: [false, false], hat: [false, false] },
    muted: { melody: true, drums: false, bass: false }
  };
  const bytes = buildMidiFile(tracks, 120, 2, false);
  const parsed = parseMidiFile(bytes);
  assert.ok(!parsed.notes.some(n => n.channel === 0), 'muted melody should not be in MIDI');
  assert.ok(parsed.notes.some(n => n.channel === 1), 'bass should still be in MIDI');
});

if (process.exitCode) {
  console.error(`\n${passed} passed, some failed.`);
} else {
  console.log(`\nAll ${passed} tests passed successfully! 🎉`);
}
