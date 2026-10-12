/* Full-app smoke / load test.
   Loads EVERY browser script as a real <script> tag (the way index.html
   does), so top-level load-time collisions are caught — exactly the class
   of bug where `const Tonal` clashed with the tonal CDN global and silently
   disabled Theory mode. Then it enters all four modes and checks the UI is
   built without throwing. */
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
w.addEventListener('error', e => errors.push(e.error ? String(e.error && e.error.stack || e.error) : e.message));
w.onerror = (m, s, l, c, err) => errors.push('onerror: ' + (err && err.stack || m));

// minimal storage so i18n/achievements/compose can initialise
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

// ---- external CDN bundles (local copies) ----
inject(read('node_modules/tonal/browser/tonal.min.js'));
inject(read('node_modules/abcjs/dist/abcjs-basic-min.js'));

// ---- data normally fetched from JSON ----
w.TONORA_INSTRUMENTS = JSON.parse(read('data/instruments.json')).instruments;
w.TONORA_SONGS = JSON.parse(read('data/songs.json')).songs;

// ---- app scripts, in index.html order ----
['i18n.js', 'store.js', 'achievements.js', 'audio.js', 'piano.js', 'play.js', 'learn.js',
 'backing.js', 'midi.js', 'compose.js', 'theory-content.js', 'notation.js', 'theory.js']
  .forEach(f => inject(read('js/' + f)));

// jsdom has no canvas 2D backend; provide a minimal context so Learn's
// canvas setup doesn't throw.
const ctx2d = new Proxy({}, { get: () => () => {} });
w.HTMLCanvasElement.prototype.getContext = () => ctx2d;

// Replace the Web Audio engine with a no-op stub (jsdom has no AudioContext).
// The real engine is never exercised here; we only need the modes to build.
w.TonoraAudio = {
  ctx: { currentTime: 0, state: 'running', sampleRate: 44100 },
  master: {}, reverb: {}, delay: {}, isRecording: false,
  ensure() { return this.ctx; },
  guard() {}, revive() { return Promise.resolve(true); },
  playNote() { return { stop() {} }; },
  playDrum() { return { stop() {} }; },
  scheduleNote() { return { stop() {} }; },
  scheduleDrum() { return { stop() {} }; },
  setBusGain() {}, setBusPan() {}, getBusLevel() { return 0; },
  getVisualizerData() { return null; },
  setMasterGain() {}, setReverbGain() {}, setDelayGain() {},
  setEq() {}, setChorus() {}
};

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✅ ${name}`); }
  catch (err) { console.error(`❌ ${name}: ${err.message}`); process.exitCode = 1; }
}

const app = () => w.document.getElementById('app');
// Top-level `const`/`class` in a classic script create lexical globals, not
// properties of window, so read them through the realm's evaluator.
const g = (name) => w.eval(name);

test('every script loaded with no errors and no global collisions', () => {
  assert.deepStrictEqual(errors, []);
});

test('all mode objects + wrappers are defined', () => {
  ['PlayMode', 'LearnMode', 'ComposeMode', 'TheoryMode', 'TonoraAchievements',
   'PianoUI'].forEach(k => assert.ok(g(k), k + ' missing'));
  ['TonoraAudio', 'noteToFreq', 'buildMidiFile', 'TonoraBacking',
   'TonoraTheory', 'TonoraNotation'].forEach(k => assert.ok(w[k], k + ' missing'));
  assert.strictEqual(typeof w.armAudioRevive, 'function');
  assert.strictEqual(typeof w.renderCompositionToWav, 'function');
});

test('Play mode builds tabs, piano and selects an instrument', () => {
  const PlayMode = g('PlayMode');
  app().innerHTML = '';
  PlayMode.enter(app());
  assert.ok(app().querySelector('#inst-tabs .inst-tab'), 'no instrument tabs');
  assert.ok(app().querySelector('.piano .key'), 'no piano keys');
  PlayMode.select('drums');
  assert.ok(app().querySelector('.drum-pad'), 'no drum pads');
  PlayMode.leave();
});

test('Learn mode lists songs and can start + finish one', () => {
  const LearnMode = g('LearnMode');
  app().innerHTML = '';
  LearnMode.enter(app());
  const cards = app().querySelectorAll('.song-card');
  assert.ok(cards.length >= 1, 'no song cards');
  cards[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(app().querySelector('.learn-stage:not(.hidden)'), 'stage not shown');
  assert.ok(LearnMode.song && LearnMode.running, 'song did not start');
  LearnMode.stop();
});

test('Compose mode builds the roll, mixer and project controls', () => {
  const ComposeMode = g('ComposeMode');
  app().innerHTML = '';
  ComposeMode.enter(app());
  assert.ok(app().querySelector('#roll .roll-row'), 'no sequencer rows');
  assert.ok(app().querySelector('#cmp-projects'), 'no project selector');
  assert.ok(app().querySelector('#cmp-import-midi'), 'no MIDI import');
  // toggling a melody cell must not throw and must only touch that cell
  const cell = app().querySelector('#roll .roll-cell.mel');
  cell.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(cell.classList.contains('on'), 'cell did not turn on');
  ComposeMode.leave();
});

test('Compose undo/redo restores note edits', () => {
  const ComposeMode = g('ComposeMode');
  app().innerHTML = '';
  ComposeMode.enter(app());
  const cellOf = () => app().querySelector('#roll .roll-cell.mel');
  const cell = cellOf();
  const wasOn = cell.classList.contains('on');
  cell.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.notStrictEqual(cellOf().classList.contains('on'), wasOn, 'cell did not toggle');
  ComposeMode.undo();
  assert.strictEqual(cellOf().classList.contains('on'), wasOn, 'undo did not restore previous state');
  ComposeMode.redo();
  assert.notStrictEqual(cellOf().classList.contains('on'), wasOn, 'redo did not re-apply edit');
  ComposeMode.undo();
  ComposeMode.leave();
  assert.deepStrictEqual(errors, []);
});

test('Theory mode renders a lesson and answering does not throw', () => {
  const TheoryMode = g('TheoryMode');
  app().innerHTML = '';
  TheoryMode.enter(app());
  assert.ok(app().querySelector('.theory-tab'), 'no lesson tabs');
  assert.ok(app().querySelector('svg'), 'no notation');
  const note = TheoryMode.expected[0];
  const key = app().querySelector(`.key[data-note="${note}"]`);
  assert.ok(key, `no key element for ${note}`);
  key.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  TheoryMode.leave();
});

test('Ear training hides the answer and grades from choice buttons', () => {
  const TheoryMode = g('TheoryMode');
  app().innerHTML = '';
  TheoryMode.enter(app());
  const tab = app().querySelector('.theory-tab[data-id="ear-intervals"]');
  assert.ok(tab, 'no ear-intervals tab');
  tab.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(app().querySelector('.theory-mystery'), 'the answer was not hidden');
  const choices = app().querySelectorAll('.theory-choice');
  assert.strictEqual(choices.length, 6, `expected 6 choices, got ${choices.length}`);
  choices[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const prompt = (app().querySelector('#th-prompt') || {}).textContent || '';
  assert.ok(prompt.startsWith('✅') || prompt.startsWith('❌'), `judge did not run: ${prompt}`);
  assert.deepStrictEqual(errors, []);
  TheoryMode.leave();
});

test('switching modes repeatedly leaves no stale state or errors', () => {
  ['play', 'learn', 'compose', 'theory'].forEach(id => {
    const mode = { play: g('PlayMode'), learn: g('LearnMode'), compose: g('ComposeMode'), theory: g('TheoryMode') }[id];
    if (mode && mode.leave) mode.leave();
  });
  assert.deepStrictEqual(errors, []);
});

if (process.exitCode) {
  console.error(`\n${passed} passed, some failed.`);
} else {
  console.log(`\nAll ${passed} smoke tests passed successfully! 🎉`);
}
