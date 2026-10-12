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

window.TONORA_INSTRUMENTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'instruments.json'), 'utf8')).instruments;

const files = [
  'i18n.js', 'achievements.js', 'audio.js', 'midi.js', 'backing.js', 'theory-content.js',
  'notation.js', 'piano.js', 'play.js', 'learn.js', 'compose.js', 'theory.js'
];
let source = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n;\n');
// export a few module objects from the shared script scope for assertions
source += '\n;window.__test = { ComposeMode, TonoraBacking, PlayMode, PianoUI };';

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

test('AudioEngine exposes the bus and FX API', () => {
  ['getBus', 'setBusGain', 'setBusPan', 'getBusLevel', 'setEq', 'setChorus'].forEach(m =>
    assert.strictEqual(typeof window.TonoraAudio[m], 'function', m + ' missing'));
});

test('AudioEngine setEq and setChorus update internal parameters', () => {
  window.TonoraAudio.setEq(4, -2, 6);
  assert.strictEqual(window.TonoraAudio.eq.bass, 4);
  assert.strictEqual(window.TonoraAudio.eq.mid, -2);
  assert.strictEqual(window.TonoraAudio.eq.treble, 6);
  window.TonoraAudio.setChorus(0.35, 2.0, 0.003);
  assert.strictEqual(window.TonoraAudio.chorus.wet, 0.35);
  assert.strictEqual(window.TonoraAudio.chorus.rate, 2.0);
  assert.strictEqual(window.TonoraAudio.chorus.depth, 0.003);
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

test('ComposeMode.toSongObject bridges sequencer steps into falling notes song', () => {
  const CM = window.__test.ComposeMode;
  CM.steps = 16;
  CM.bpm = 100;
  CM.tracks = {
    melody: ['C4', null, 'E4', null, ['G4', 'B4'], null, null, null, null, null, null, null, null, null, null, null],
    bass: new Array(16).fill(null),
    drums: { kick: new Array(16).fill(false), snare: new Array(16).fill(false), hat: new Array(16).fill(false) }
  };
  const song = CM.toSongObject();
  assert.ok(song, 'song should not be null');
  assert.strictEqual(song.bpm, 100);
  assert.strictEqual(song.notes.length, 4);
  assert.strictEqual(song.notes[0].n, 'C4');
  assert.strictEqual(song.notes[0].t, 0);
  assert.strictEqual(song.notes[1].n, 'E4');
  assert.strictEqual(song.notes[1].t, 0.5);
  assert.strictEqual(song.notes[2].t, 1.0);
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

test('PianoUI highlights scale notes and root', () => {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const piano = new window.__test.PianoUI(container, { octaves: 2, startOctave: 3 });
  piano.highlightScale('major');
  assert.ok(piano.keys['C3'].classList.contains('scale-hint'));
  assert.ok(piano.keys['C3'].classList.contains('scale-root'));
  assert.ok(piano.keys['E3'].classList.contains('scale-hint'));
  assert.ok(!piano.keys['E3'].classList.contains('scale-root'));
  assert.ok(!piano.keys['C#3'].classList.contains('scale-hint'));
  piano.highlightScale('');
  assert.ok(!piano.keys['C3'].classList.contains('scale-hint'));
});

test('PlayMode plays full chord in chord mode', () => {
  const root = window.document.createElement('div');
  window.document.body.appendChild(root);
  const PM = window.__test.PlayMode;
  PM.enter(root);
  PM.chordMode = 'min';
  const playedNotes = [];
  const origPlay = window.TonoraAudio.playNote;
  window.TonoraAudio.playNote = (inst, note) => { playedNotes.push(note); };
  PM.piano.onNote('A3');
  window.TonoraAudio.playNote = origPlay;
  assert.deepStrictEqual(playedNotes, ['A3', 'C4', 'E4']);
  PM.leave();
});

test('PianoUI sets and clears Persian microtone tuning badges and emits microtone notes', () => {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  let played = null;
  const piano = new window.__test.PianoUI(container, {
    octaves: 2,
    startOctave: 3,
    onNote: (n) => { played = n; }
  });
  piano.setTuning({ 'E3': 'Ep3' });
  assert.ok(piano.keys['E3'].classList.contains('koron-key'), 'E3 should have koron-key class');
  assert.strictEqual(piano.keys['E3'].querySelector('.micro-badge').textContent, '𝄹');
  piano.press('E3');
  assert.strictEqual(played, 'Ep3');
  piano.setTuning(null);
  assert.ok(!piano.keys['E3'].classList.contains('koron-key'));
  assert.strictEqual(piano.keys['E3'].querySelector('.micro-badge'), null);
});

test('PlayMode getTuningMap returns correct Persian Dastgah note mapping', () => {
  const PM = window.__test.PlayMode;
  const shur = PM.getTuningMap('shur');
  assert.strictEqual(shur['E3'], 'Ep3');
  assert.strictEqual(shur['A4'], 'Ap4');
  const segah = PM.getTuningMap('segah');
  assert.strictEqual(segah['E3'], 'Ep3');
  assert.strictEqual(segah['B3'], 'Bp3');
});

if (process.exitCode) {
  console.error(`\n${passed} passed, some failed.`);
} else {
  console.log(`\nAll ${passed} DOM tests passed successfully! 🎉`);
}
