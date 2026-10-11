const assert = require('assert');

// Load the REAL audio engine logic (pure helpers) instead of re-implementing it.
const { noteToFreq, NOTE_OFFSET, audioBufferToWav } = require('../js/audio.js');

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

if (process.exitCode) {
  console.error(`\n${passed} passed, some failed.`);
} else {
  console.log(`\nAll ${passed} tests passed successfully! 🎉`);
}
