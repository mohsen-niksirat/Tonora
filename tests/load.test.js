/* Regression: load the real CDN bundles + our scripts as actual <script>
   tags (not eval) so top-level global collisions are caught — e.g. the
   tonal bundle declares a global `var Tonal`, and a top-level `const Tonal`
   in theory-content.js used to throw and silently disable Theory mode. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const dom = new JSDOM('<!DOCTYPE html><html data-theme="dark"><body><main id="app"></main></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'dangerously'
});
const w = dom.window;
const errors = [];
w.addEventListener('error', e => errors.push(e.error ? String(e.error) : e.message));

// minimal storage so i18n/achievements can initialise
const store = {};
w.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

function inject(code) {
  const s = w.document.createElement('script');
  s.textContent = code;
  w.document.body.appendChild(s);
}

inject(read('node_modules/tonal/browser/tonal.min.js'));
inject(read('node_modules/abcjs/dist/abcjs-basic-min.js'));
w.TONORA_INSTRUMENTS = [{ id: 'piano', name: { en: 'Piano', fa: 'پیانو' }, icon: '🎹', type: 'additive', partials: [1, 0.5], adsr: { a: 0.01, d: 0.3, s: 0.5, r: 0.2 }, wave: 'triangle' }];
['i18n.js', 'achievements.js', 'piano.js', 'midi.js', 'theory-content.js', 'notation.js', 'theory.js'].forEach(f => inject(read('js/' + f)));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✅ ${name}`); }
  catch (err) { console.error(`❌ ${name}: ${err.message}`); process.exitCode = 1; }
}

test('CDN bundles expose their globals', () => {
  assert.strictEqual(typeof w.Tonal, 'object');
  assert.strictEqual(typeof w.ABCJS, 'object');
});

test('no script threw while loading (Tonal/TonoraTheory collision)', () => {
  assert.deepStrictEqual(errors, []);
  assert.ok(w.TonoraTheory, 'window.TonoraTheory was not defined');
  assert.ok(Array.isArray(w.TonoraTheory.THEORY_LESSONS) && w.TonoraTheory.THEORY_LESSONS.length >= 5);
});

test('entering Theory mode builds a question, notation and a playable answer', () => {
  const app = w.document.getElementById('app');
  w.TheoryMode.enter(app);
  assert.ok(app.querySelector('.theory-wrap'), 'no theory UI');
  assert.ok(app.querySelector('svg'), 'no notation SVG');
  assert.ok(w.TheoryMode.lesson, 'no lesson selected');
  assert.ok(Array.isArray(w.TheoryMode.expected) && w.TheoryMode.expected.length >= 1, 'no expected answer');
  // every lesson must produce a non-empty expected answer for its question
  w.TonoraTheory.THEORY_LESSONS.forEach(l => {
    w.TheoryMode.startLesson(l);
    assert.ok(w.TheoryMode.expected.length >= 1, `lesson ${l.id} produced no expected answer`);
    assert.ok(app.querySelector('svg'), `lesson ${l.id} did not render notation`);
  });
});

test('pressing a piano key during a lesson plays a note', () => {
  // use the on-screen keyboard for the currently-expected note
  w.TheoryMode.startLesson(w.TonoraTheory.THEORY_LESSONS[0]);
  const note = w.TheoryMode.expected[0];
  const el = w.document.querySelector(`.key[data-note="${note}"]`);
  assert.ok(el, `no on-screen key for ${note}`);
  const played = [];
  w.TonoraAudio = { playNote: (...a) => { played.push(a); }, playDrum: () => {} };
  el.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  assert.ok(played.length >= 1, 'key press did not trigger playNote');
  assert.strictEqual(played[0][1], note);
});

if (process.exitCode) {
  console.error(`\n${passed} passed, some failed.`);
} else {
  console.log(`\nAll ${passed} load tests passed successfully! 🎉`);
}
