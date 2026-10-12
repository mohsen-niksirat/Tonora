/* Mobile / responsive redesign (v23) checks.
   1) Structural: the slim mobile shell actually exists in index.html and the
      shortcuts modal is styled (it had NO CSS at all before v23, so it rendered
      underneath the page content).
   2) Behavioural: history navigation — browser Back must move between modes
      instead of closing the app — and the two collapsible panels.
   3) CSS: the mobile media block is present and contains the rules we rely on. */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`✅ ${name}`); })
    .catch(err => { console.error(`❌ ${name}: ${err.message}`); process.exitCode = 1; });
}

(async () => {
  const html = read('index.html');
  const parsed = new JSDOM(html).window.document;

  /* ---------- structural ---------- */
  await test('index.html has the mobile shell hooks', () => {
    assert.ok(parsed.getElementById('more-btn'), 'no #more-btn');
    assert.ok(parsed.getElementById('hdr-extra'), 'no #hdr-extra');
    assert.ok(parsed.getElementById('mode-tabs'), 'no #mode-tabs');
    const header = parsed.querySelector('header');
    assert.ok(header.contains(parsed.getElementById('hdr-extra')), '#hdr-extra is not inside <header>');
    // the three global buttons + visualizer must live inside the collapsible group
    ['vol-slider', 'rev-slider', 'del-slider', 'vis-canvas', 'kb-btn', 'theme-btn', 'lang-btn']
      .forEach(id => assert.ok(parsed.getElementById('hdr-extra').contains(parsed.getElementById(id)),
        '#' + id + ' should be inside #hdr-extra'));
  });

  await test('shortcuts modal is wired to .modal/.modal-box (was unstyled before v23)', () => {
    const modal = parsed.getElementById('kb-modal');
    assert.ok(modal.classList.contains('modal'), 'kb-modal lost .modal');
    assert.ok(modal.querySelector('.modal-box'), 'kb-modal has no .modal-box');
    assert.ok(modal.querySelector('.modal-header'), 'kb-modal has no .modal-header');
  });

  await test('viewport no longer blocks pinch-zoom', () => {
    const vp = parsed.querySelector('meta[name=viewport]').content;
    assert.ok(!/user-scalable\s*=\s*no/.test(vp), 'user-scalable=no still present');
    assert.ok(/viewport-fit=cover/.test(vp), 'viewport-fit=cover missing');
  });

  await test('cache version bumped to v23 everywhere', () => {
    assert.ok(html.includes('css/style.css?v=24'), 'css not bumped');
    assert.ok(!/[?&]v=22/.test(html), 'stale ?v=24 reference left in index.html');
    assert.ok(read('sw.js').includes("CACHE = 'tonora-v24'"), 'sw CACHE not bumped');
  });

  await test('manifest gained scope/id/lang', () => {
    const m = JSON.parse(read('manifest.json'));
    assert.strictEqual(m.scope, './');
    assert.strictEqual(m.id, './index.html');
    assert.strictEqual(m.lang, 'en');
  });

  await test('style.css ships a mobile media block with the rules we rely on', () => {
    const css = read('css/style.css');
    assert.ok(css.includes('@media (max-width: 767px)'), 'no mobile media query');
    ['.mode-tabs {', '#hdr-extra.open', 'env(safe-area-inset-bottom)',
     '.modal-box', '#cmp-more', '.pc-hint { display: none', '.roll-cell { width: 26px']
      .forEach(s => assert.ok(css.includes(s), 'missing CSS fragment: ' + s));
    // the shortcuts modal must actually have styles now
    assert.ok(/\.modal\s*\{[^}]*position:\s*fixed/.test(css), '.modal is not a fixed overlay');
    assert.ok(/\.modal-box\s*\{[^}]*background/.test(css), '.modal-box has no background');
  });

  /* ---------- behavioural: real index.html markup + real inline script ---------- */
  const headerHtml = parsed.querySelector('header').outerHTML;
  const modalHtml = parsed.getElementById('kb-modal').outerHTML;
  const inline = [...parsed.querySelectorAll('script')]
    .map(s => s.textContent)
    .find(src => src && src.includes('function switchMode'));
  assert.ok(inline, 'could not find the inline app script in index.html');

  const dom = new JSDOM(
    `<!DOCTYPE html><html data-theme="dark"><head></head><body>${headerHtml}<main id="app"></main>${modalHtml}</body></html>`,
    { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' }
  );
  const w = dom.window;
  const errors = [];
  w.addEventListener('error', e => errors.push(e.error ? String(e.error && e.error.stack || e.error) : e.message));
  w.onerror = (m, s, l, c, err) => errors.push('onerror: ' + (err && err.stack || m));

  function inject(code) {
    const s = w.document.createElement('script');
    s.textContent = code;
    w.document.body.appendChild(s);
  }

  w.fetch = () => Promise.resolve({
    json: () => Promise.resolve({
      instruments: JSON.parse(read('data/instruments.json')).instruments,
      songs: JSON.parse(read('data/songs.json')).songs
    })
  });

  inject(read('node_modules/tonal/browser/tonal.min.js'));
  inject(read('node_modules/abcjs/dist/abcjs-basic-min.js'));
  w.TONORA_INSTRUMENTS = JSON.parse(read('data/instruments.json')).instruments;
  w.TONORA_SONGS = JSON.parse(read('data/songs.json')).songs;

  ['i18n.js', 'achievements.js', 'audio.js', 'piano.js', 'play.js', 'learn.js',
   'backing.js', 'midi.js', 'compose.js', 'theory-content.js', 'notation.js', 'theory.js']
    .forEach(f => inject(read('js/' + f)));

  const ctx2d = new Proxy({}, { get: () => () => {} });
  w.HTMLCanvasElement.prototype.getContext = () => ctx2d;
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

  inject(inline);
  await new Promise(r => setTimeout(r, 60)); // let loadData().then(...) settle

  const g = name => w.eval(name);
  const app = () => w.document.getElementById('app');

  await test('inline script booted into home and captured the header controls', () => {
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(g('currentMode'), 'home');
    assert.ok(app().querySelector('.mode-card'), 'home did not render');
    assert.strictEqual(typeof w.eval('navigateTo'), 'function');
    assert.strictEqual(typeof w.eval('modeFromLocation'), 'function');
  });

  await test('navigateTo pushes a history entry and sets the hash', () => {
    w.eval("navigateTo('play')");
    assert.strictEqual(g('currentMode'), 'play');
    assert.ok(w.history.state && w.history.state.mode === 'play', 'state not pushed: ' + JSON.stringify(w.history.state));
    assert.strictEqual(w.location.hash, '#play');
    w.eval("navigateTo('compose')");
    assert.strictEqual(g('currentMode'), 'compose');
    assert.strictEqual(w.history.state.mode, 'compose');
  });

  await test('browser Back pops modes instead of closing the app', () => {
    // popstate with no state falls back to the hash, which is what a real
    // Back press looks like after the entry has been restored
    w.history.replaceState({ mode: 'home' }, '', '#home');
    w.dispatchEvent(new w.PopStateEvent('popstate', { state: { mode: 'play' } }));
    assert.strictEqual(g('currentMode'), 'play', 'popstate did not restore play');
    w.dispatchEvent(new w.PopStateEvent('popstate', { state: { mode: 'home' } }));
    assert.strictEqual(g('currentMode'), 'home', 'popstate did not restore home');
    w.dispatchEvent(new w.PopStateEvent('popstate', { state: null }));
    assert.deepStrictEqual(errors, []);
  });

  await test('a deep-linked hash boots straight into that mode', () => {
    w.location.hash = '#theory';
    assert.strictEqual(w.eval('modeFromLocation()'), 'theory');
    w.location.hash = '#nope';
    assert.strictEqual(w.eval('modeFromLocation()'), 'home');
    w.location.hash = '#home';
  });

  await test('the mobile settings panel toggles', () => {
    const more = w.document.getElementById('more-btn');
    const extra = w.document.getElementById('hdr-extra');
    assert.ok(!extra.classList.contains('open'), 'panel starts open');
    more.click();
    assert.ok(extra.classList.contains('open'), 'panel did not open');
    assert.strictEqual(more.getAttribute('aria-expanded'), 'true');
    more.click();
    assert.ok(!extra.classList.contains('open'), 'panel did not close');
  });

  await test('compose collapses secondary controls behind the ⋯ button', () => {
    w.eval("navigateTo('compose')");
    const btn = app().querySelector('#cmp-more-btn');
    const box = app().querySelector('#cmp-more');
    assert.ok(btn, 'no #cmp-more-btn');
    assert.ok(box, 'no #cmp-more');
    // secondary controls must live inside the collapsible group
    ['#cmp-vel', '#cmp-presets', '#cmp-mixer-btn', '#cmp-save', '#cmp-export',
     '#cmp-projects', '#cmp-clear'].forEach(sel => assert.ok(box.querySelector(sel), sel + ' is not collapsible'));
    // transport controls must stay visible at all times
    ['#cmp-play', '#cmp-stop', '#cmp-undo', '#cmp-redo', '#cmp-bpm', '#cmp-len']
      .forEach(sel => assert.ok(!box.querySelector(sel) && app().querySelector(sel), sel + ' must stay in the primary row'));
    assert.ok(!box.classList.contains('open'), 'panel starts collapsed');
    btn.click();
    assert.ok(box.classList.contains('open'), 'panel did not expand');
    btn.click();
    assert.ok(!box.classList.contains('open'), 'panel did not collapse');
  });

  await test('theory piano drops to 2 octaves on a narrow viewport', () => {
    w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.eval("navigateTo('theory')");
    const TheoryMode = g('TheoryMode');
    assert.strictEqual(app().querySelectorAll('.key.white').length, 14,
      `expected 14 white keys on mobile, got ${app().querySelectorAll('.key.white').length}`);
    // restore wide viewport and re-enter
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    TheoryMode.leave();
    TheoryMode.enter(app());
    assert.strictEqual(app().querySelectorAll('.key.white').length, 21, 'wide viewport should keep 3 octaves');
    TheoryMode.leave();
    assert.deepStrictEqual(errors, []);
  });

  await test('every lesson answer still fits on the 2-octave mobile keyboard', () => {
    w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.eval("navigateTo('theory')");
    const TheoryMode = g('TheoryMode');
    const T = w.TonoraTheory;
    T.THEORY_LESSONS.forEach(lesson => {
      if (lesson.type === 'ear') return; // answered with buttons, not keys
      const win = TheoryMode.pianoWindow(lesson);
      assert.ok(win && win.octaves === 2,
        `${lesson.id}: expected a 2-octave window, got ${JSON.stringify(win)}`);
      const startMidi = (win.startOctave + 1) * 12;
      const endMidi = startMidi + win.octaves * 12 - 1;
      // sample every question the lesson can ask
      const questions = [];
      if (lesson.type === 'note') lesson.pool.forEach(n => questions.push(n));
      else if (lesson.type === 'interval') lesson.intervals.forEach(i => questions.push({ interval: i }));
      else if (lesson.type === 'chord') lesson.roots.forEach(r => questions.push({ root: r }));
      else if (lesson.type === 'scale') questions.push({});
      questions.forEach(q => {
        T.expectedFor(lesson, q).forEach(note => {
          const midi = TheoryMode._midiOf(note);
          assert.ok(midi >= startMidi && midi <= endMidi,
            `${lesson.id}: ${note} (midi ${midi}) is outside the mobile keyboard ${startMidi}-${endMidi}`);
        });
      });
      // switching lessons must actually rebuild the keyboard
      TheoryMode.startLesson(lesson);
      assert.ok(TheoryMode.piano, `${lesson.id}: piano not built`);
      assert.strictEqual(typeof TheoryMode.piano.startOctave, 'number', `${lesson.id}: piano lost startOctave`);
      assert.ok(app().querySelectorAll('#th-piano .key').length > 0, `${lesson.id}: piano rendered no keys`);
    });
    TheoryMode.leave();
    assert.deepStrictEqual(errors, []);
  });

  await test('no errors accumulated across the whole run', () => {
    assert.deepStrictEqual(errors, []);
  });

  if (process.exitCode) console.error(`\n${passed} passed, some failed.`);
  else console.log(`\nAll ${passed} responsive tests passed successfully! 🎉`);

  // the inline script starts a requestAnimationFrame loop for the visualizer;
  // without this jsdom never lets the event loop drain and node hangs.
  dom.window.close();
})().catch(err => {
  console.error('❌ responsive suite crashed:', err && err.stack || err);
  process.exitCode = 1;
});
