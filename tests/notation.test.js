/* Integration test for the abcjs-backed notation engine.
   Loads the real abcjs build + our notation/theory scripts in jsdom,
   renders the C-major scale and checks that abcjs exposes MIDI pitches
   (which our animated keyboard highlighting depends on). Deterministic:
   no timers are involved. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const abcjs = fs.readFileSync(path.join(root, 'node_modules', 'abcjs', 'dist', 'abcjs-basic-min.js'), 'utf8');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="paper"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});
const { window } = dom;
window.eval(abcjs);
['midi.js', 'notation.js', 'theory-content.js'].forEach(f => {
  window.eval(fs.readFileSync(path.join(root, 'js', f), 'utf8'));
});

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✅ ${name}`); }
  catch (err) { console.error(`❌ ${name}: ${err.message}`); process.exitCode = 1; }
}

const N = window.TonoraNotation;
const T = window.TonoraTheory;

test('abcjs is available to the notation wrapper', () => {
  assert.ok(N.available());
});

test('noteToAbc maps names to ABC tokens', () => {
  assert.strictEqual(N.noteToAbc('C4'), 'C');
  assert.strictEqual(N.noteToAbc('C5'), 'c');
  assert.strictEqual(N.noteToAbc('C3'), 'C,');
  assert.strictEqual(N.noteToAbc('F#4'), '^F');
});

test('C-major scale renders and exposes the right MIDI pitches', () => {
  const paper = window.document.getElementById('paper');
  const vis = N.render(paper, N.abcFromNotes(T.scaleNotes('C major', 3), { qpm: 90 }));
  assert.ok(vis, 'render returned no visual object');
  assert.ok(paper.querySelector('svg'), 'no SVG produced');
  assert.strictEqual(typeof vis.setUpAudio, 'function');
  vis.setUpAudio({});
  vis.setTiming(120, 0);
  const pitches = (vis.noteTimings || []).map(e => (e.midiPitches || []).map(p => p.pitch)).filter(a => a.length);
  // compare via JSON to sidestep cross-realm prototype differences in jsdom
  assert.strictEqual(JSON.stringify(pitches), JSON.stringify([[48], [50], [52], [53], [55], [57], [59]]));
});

test('a block chord renders as a single simultaneous event', () => {
  const paper = window.document.getElementById('paper');
  const vis = N.render(paper, N.abcChord(['C4', 'E4', 'G4']));
  vis.setUpAudio({});
  vis.setTiming(120, 0);
  const first = (vis.noteTimings || []).find(e => (e.midiPitches || []).length);
  assert.ok(first, 'no note event found');
  assert.deepStrictEqual(Array.from(first.midiPitches.map(p => p.pitch)).sort((a, b) => a - b), [60, 64, 67]);
});

if (process.exitCode) {
  console.error(`\n${passed} passed, some failed.`);
} else {
  console.log(`\nAll ${passed} notation tests passed successfully! 🎉`);
}
