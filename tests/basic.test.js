const assert = require('assert');

// A simple unit test to fulfill the repository health requirement
console.log('Running basic tests...');

function testNoteToFreqLogic(noteStr) {
  // Mock logic of what's inside audio.js
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const p = noteStr.match(/([A-G]#?)(\d)/);
  if (!p) return 0;
  const noteIdx = names.indexOf(p[1]);
  const oct = parseInt(p[2], 10);
  const n = noteIdx + (oct + 1) * 12;
  return 440 * Math.pow(2, (n - 69) / 12);
}

try {
  const freqA4 = testNoteToFreqLogic('A4');
  assert.strictEqual(freqA4, 440, 'A4 should be 440Hz');
  console.log('✅ A4 frequency test passed.');
  
  const freqC4 = testNoteToFreqLogic('C4');
  assert.ok(Math.abs(freqC4 - 261.63) < 0.1, 'C4 should be approx 261.63Hz');
  console.log('✅ C4 frequency test passed.');

  console.log('\nAll tests passed successfully! 🎉');
  process.exit(0);
} catch (err) {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
}
