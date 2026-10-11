/* DOM/integration tests: load the real browser scripts into jsdom and
   exercise cross-module behaviour that the pure unit tests can't reach. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});
const { window } = dom;

// expose the pieces the scripts expect at load time
window.requestAnimationFrame = window.requestAnimationFrame || (() => 0);
window.cancelAnimationFrame = window.cancelAnimationFrame || (() => {});
if (!window.localStorage) {
  const store = {};
  window.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

const files = [
  'i18n.js', 'achievements.js', 'audio.js', 'midi.js', 'backing.js', 'theory-content.js',
  'notation.js', 'piano.js', 'play.js', 'learn.js', 'compose.js', 'theory.js'
];
let source = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n;\n');
// export a few module objects from the shared script scope for assertions
source += '\n;window.__test = { ComposeMode, TonoraBacking };';

window.eval(source);

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

test('all modules loaded without throwing', () => {
  assert.ok(window.TonoraAudio, 'AudioEngine missing');
  assert.ok(window.__test.ComposeMode, 'ComposeMode missing');
  assert.ok(typeof window.buildMidiFile === 'function');
  assert.ok(typeof window.midiToTracks === 'function');
});

test('AudioEngine exposes the bus API', () => {
  ['getBus', 'setBusGain', 'setBusPan', 'getBusLevel'].forEach(m =>
    assert.strictEqual(typeof window.TonoraAudio[m], 'function', m + ' missing'));
});

test('normalizeTracks upgrades a legacy drum lane to kick/snare/hat', () => {
  const CM = window.__test.ComposeMode;
  CM.steps = 8;
  const t = CM.normalizeTracks({ melody: ['C4'], bass: [], drums: [true, false, false, false, false, false, false, true], velocity: 0.8 });
  assert.ok(!Array.isArray(t.drums), 'drums should become an object');
  assert.strictEqual(t.drums.kick[0], true);
  assert.strictEqual(t.drums.hat[7], true);
  assert.ok(t.mixer && t.mixer.melody);
});

test('ComposeMode.stepDur matches a sixteenth note', () => {
  const CM = window.__test.ComposeMode;
  CM.bpm = 120;
  assert.ok(Math.abs(CM.stepDur() - 60 / 120 / 4) < 1e-9);
});

test('backing generator runs inside the browser scope', () => {
  const song = { notes: [{ n: 'C4', t: 0, d: 4 }] };
  const res = window.__test.TonoraBacking.buildBacking(song);
  assert.strictEqual(res.keyName, 'C');
  assert.strictEqual(res.bars.length, 1);
});

test('theory curriculum and notation wrapper load in the browser', () => {
  assert.ok(window.TonoraTheory && Array.isArray(window.TonoraTheory.THEORY_LESSONS));
  assert.ok(window.TonoraTheory.THEORY_LESSONS.length >= 5);
  assert.ok(window.TonoraNotation && typeof window.TonoraNotation.noteToAbc === 'function');
  // In ABC, middle C (C4) is uppercase C; C5 is lowercase c; C3 is C,
  assert.strictEqual(window.TonoraNotation.noteToAbc('C4'), 'C');
  assert.strictEqual(window.TonoraNotation.noteToAbc('C5'), 'c');
  assert.strictEqual(window.TonoraNotation.noteToAbc('C3'), 'C,');
  assert.strictEqual(window.TonoraNotation.noteToAbc('F#4'), '^F');
});

test('theory answer-checking works via the browser global', () => {
  const r = window.TonoraTheory.validateAnswer({ type: 'chord', quality: 'maj' }, { root: 'C4' }, ['C4', 'E4', 'G4']);
  assert.strictEqual(r.correct, true);
});

if (process.exitCode) {
  console.error(`\n${passed} passed, some failed.`);
} else {
  console.log(`\nAll ${passed} DOM tests passed successfully! 🎉`);
}
