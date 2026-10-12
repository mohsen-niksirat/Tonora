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
  'i18n.js', 'store.js', 'achievements.js', 'audio.js', 'midi.js', 'backing.js', 'theory-content.js',
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
  root.remove();
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

test('Santur and Tonbak instruments exist and load correctly', () => {
  const santur = window.TONORA_INSTRUMENTS.find(i => i.id === 'santur');
  assert.ok(santur, 'santur instrument definition missing');
  assert.strictEqual(santur.type, 'santur');
  assert.ok(santur.dur >= 3.0);

  const tonbak = window.TONORA_INSTRUMENTS.find(i => i.id === 'tonbak');
  assert.ok(tonbak, 'tonbak instrument definition missing');
  assert.strictEqual(tonbak.type, 'drumkit');
  assert.strictEqual(tonbak.pads.length, 6);
  const padIds = tonbak.pads.map(p => p.id);
  assert.ok(padIds.includes('tonbak-tom'));
  assert.ok(padIds.includes('tonbak-bak'));
  assert.ok(padIds.includes('tonbak-pelang'));
  assert.ok(padIds.includes('tonbak-riz'));
  assert.ok(padIds.includes('tonbak-kenar'));
  assert.ok(padIds.includes('tonbak-choub'));
});

test('PlayMode renders Tonbak drum pads and handles stroke trigger', () => {
  const root = window.document.createElement('div');
  window.document.body.appendChild(root);
  const PM = window.__test.PlayMode;
  PM.enter(root);
  PM.select('tonbak');
  const pads = root.querySelectorAll('.drum-pad');
  assert.strictEqual(pads.length, 6, 'should render 6 Tonbak drum pads');
  let playedPad = null;
  const origPlayDrum = window.TonoraAudio.playDrum;
  window.TonoraAudio.playDrum = (inst, padId) => { playedPad = padId; };
  pads[0].dispatchEvent(new window.Event('pointerdown'));
  assert.strictEqual(playedPad, 'tonbak-tom');
  window.TonoraAudio.playDrum = origPlayDrum;
  PM.leave();
  root.remove();
});

test('PlayMode includes scroll buttons and inst-bar for instruments', () => {
  const root = window.document.createElement('div');
  window.document.body.appendChild(root);
  const PM = window.__test.PlayMode;
  PM.enter(root);
  const scrollLeft = root.querySelector('#inst-scroll-left');
  const scrollRight = root.querySelector('#inst-scroll-right');
  const tabs = root.querySelector('#inst-tabs');
  assert.ok(scrollLeft, '#inst-scroll-left missing');
  assert.ok(scrollRight, '#inst-scroll-right missing');
  assert.ok(tabs, '#inst-tabs missing');
  PM.leave();
  root.remove();
});

test('PianoUI has keyboard shortcuts across both octaves and responds to keyboard events', () => {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const played = [];
  const piano = new window.__test.PianoUI(container, {
    octaves: 2,
    startOctave: 3,
    onNote: (n) => played.push(n)
  });
  // Check key hints exist across first and second octaves
  assert.ok(piano.keys['C3'].textContent.includes('Z'));
  assert.ok(piano.keys['C#3'].textContent.includes('S'));
  assert.ok(piano.keys['B3'].textContent.includes('M'));
  assert.ok(piano.keys['C4'].textContent.includes('Q'));
  assert.ok(piano.keys['C#4'].textContent.includes('2'));
  assert.ok(piano.keys['G#4'].textContent.includes('6'));
  assert.ok(piano.keys['A4'].textContent.includes('Y'));
  assert.ok(piano.keys['A#4'].textContent.includes('7'));
  assert.ok(piano.keys['B4'].textContent.includes('U'));

  // Test keyboard events via code and key
  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyZ', key: 'z' }));
  assert.strictEqual(played[played.length - 1], 'C3');

  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Digit2', key: '2' }));
  assert.strictEqual(played[played.length - 1], 'C#4');

  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyU', key: 'u' }));
  assert.strictEqual(played[played.length - 1], 'B4');

  // Test Persian character mapping
  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyQ', key: 'ض' }));
  assert.strictEqual(played[played.length - 1], 'C4');

  // Test 3-octave piano (Theory Mode layout)
  const p3 = new window.__test.PianoUI(container, {
    octaves: 3,
    startOctave: 3,
    onNote: (n) => played.push(n)
  });
  // Check key hints exist across third octave
  assert.ok(p3.keys['C5'].textContent.includes('I'));
  assert.ok(p3.keys['C#5'].textContent.includes('8'));
  assert.ok(p3.keys['D5'].textContent.includes('O'));
  assert.ok(p3.keys['D#5'].textContent.includes('9'));
  assert.ok(p3.keys['E5'].textContent.includes('P'));
  assert.ok(p3.keys['F5'].textContent.includes('['));
  assert.ok(p3.keys['G5'].textContent.includes(']'));
  assert.ok(p3.keys['B5'].textContent.includes(';'));

  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyI', key: 'i' }));
  assert.strictEqual(played[played.length - 1], 'C5');

  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Digit8', key: '8' }));
  assert.strictEqual(played[played.length - 1], 'C#5');

  p3.destroy();
  container.remove();
});

/* ---- Phase 2 additions ---- */

test('TonoraStore falls back to localStorage when IDB is unavailable', async () => {
  const S = window.TonoraStore;
  assert.ok(S, 'TonoraStore missing');
  // jsdom has no indexedDB, so _idb should be null → localStorage path
  await S.set('demo', { bpm: 90, steps: 16, tracks: { melody: ['C4'] } });
  const names = await S.list();
  assert.ok(names.includes('demo'), 'project not listed');
  const got = await S.get('demo');
  assert.strictEqual(got.bpm, 90);
  const all = await S.all();
  assert.ok(all.demo, 'project not in all()');
  await S.del('demo');
  assert.strictEqual(await S.get('demo'), null);
});

test('PlayMode note capture quantizes to a 16th grid and hands off to Compose', async () => {
  const PM = window.__test.PlayMode;
  // simulate a recorded capture: notes at 0, ~0.25s, ~0.5s @120bpm → steps 0,2,4
  const cap = {
    bpm: 120,
    notes: [
      { n: 'C4', t: 0, d: 0.125, v: 0.8 },
      { n: 'E4', t: 0.26, d: 0.125, v: 0.8 },  // step ≈2.08 → 2
      { n: 'G4', t: 0.51, d: 0.125, v: 0.8 },  // step ≈4.08 → 4
      { n: 'E4', t: 0.51, d: 0.125, v: 0.8 }   // same step → chord
    ]
  };
  PM.sendCaptureToCompose(cap);
  const inbox = window.__composeInbox;
  assert.ok(inbox, 'inbox not set');
  assert.strictEqual(inbox.tracks.melody[0], 'C4');
  assert.strictEqual(inbox.tracks.melody[2], 'E4');
  assert.ok(Array.isArray(inbox.tracks.melody[4]) && inbox.tracks.melody[4].includes('G4'), 'chord not grouped');
  assert.strictEqual(inbox.bpm, 120);
});

test('ComposeMode consumeInbox loads a captured performance into the roll', () => {
  const CM = window.__test.ComposeMode;
  // drop an inbox directly (skip navigation)
  window.__composeInbox = {
    bpm: 100, steps: 16,
    tracks: { melody: ['C4', null, 'E4'], bass: [], drums: { kick: [true], snare: [], hat: [] } }
  };
  CM.steps = 16;
  const ok = CM.consumeInbox();
  assert.strictEqual(ok, true);
  assert.strictEqual(CM.bpm, 100);
  assert.strictEqual(CM.tracks.melody[0], 'C4');
  assert.strictEqual(CM.tracks.melody[2], 'E4');
  assert.strictEqual(window.__composeInbox, null, 'inbox should be cleared');
});

test('ComposeMode setHumanize clamps the range', () => {
  const CM = window.__test.ComposeMode;
  CM.setHumanize(999); assert.strictEqual(CM.humanize, 60);
  CM.setHumanize(-5); assert.strictEqual(CM.humanize, 0);
  CM.setHumanize(25); assert.strictEqual(CM.humanize, 25);
});

if (process.exitCode) {
  console.error(`\n${passed} passed, some failed.`);
} else {
  console.log(`\nAll ${passed} DOM tests passed successfully! 🎉`);
}
