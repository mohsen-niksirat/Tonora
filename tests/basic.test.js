const assert = require('assert');

// Load the REAL audio engine logic (pure helpers) instead of re-implementing it.
const { noteToFreq, NOTE_OFFSET, audioBufferToWav } = require('../js/audio.js');
const { noteNameToMidi, vlq, buildMidiFile } = require('../js/midi.js');
const { buildBacking, pcToNote, inferKeyRoot, pcOf } = require('../js/backing.js');

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

if (process.exitCode) {
  console.error(`\n${passed} passed, some failed.`);
} else {
  console.log(`\nAll ${passed} tests passed successfully! 🎉`);
}
