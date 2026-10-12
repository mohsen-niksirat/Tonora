/* Tonora — Theory mode: animated music-theory lessons.
   Notation + animated cursor via abcjs (TonoraNotation), curriculum and
   answer-checking via Tonal (TonoraTheory), sound via TonoraAudio and the
   keyboard via the shared PianoUI. */
'use strict';

const TheoryMode = {
  lesson: null,
  piano: null,
  playback: null,
  visual: null,
  question: null,
  expected: [],
  playNotes: [],
  playIsChord: false,
  played: [],
  promptText: '',
  score: 0,
  streak: 0,

  inst() {
    return (window.TONORA_INSTRUMENTS || []).find(i => i.id === 'piano');
  },

  enter(root) {
    this.score = 0;
    this.streak = 0;
    this.lesson = (window.TonoraTheory && window.TonoraTheory.THEORY_LESSONS[0]) || null;
    root.innerHTML = `
      <div class="theory-wrap">
        <div class="theory-head">
          <div class="theory-tabs" id="th-tabs"></div>
          <div class="theory-score" id="th-score"></div>
        </div>
        <div class="theory-blurb" id="th-blurb"></div>
        <div class="theory-prompt" id="th-prompt"></div>
        <div class="theory-board" id="th-board"></div>
        <div class="theory-actions" id="th-actions"></div>
        <div id="th-piano" class="theory-piano"></div>
      </div>`;
    this.renderTabs();
    if (!window.TonoraNotation || !window.TonoraNotation.available()) {
      const board = document.getElementById('th-board');
      if (board) board.innerHTML = `<p class="muted">${t('theoryOffline')}</p>`;
    }
    this.updateScore();
    if (this.lesson) this.startLesson(this.lesson);
    // narrow screens rebuild the keyboard when the viewport crosses the breakpoint
    this._onResize = () => {
      const narrow = this._isNarrow();
      if (narrow === this._narrowBuilt) return;
      this.setupPiano(this.lesson);
    };
    window.addEventListener('resize', this._onResize);
  },

  renderTabs() {
    const tabs = document.getElementById('th-tabs');
    if (!tabs || !window.TonoraTheory) return;
    tabs.innerHTML = '';
    window.TonoraTheory.THEORY_LESSONS.forEach(l => {
      const b = document.createElement('button');
      b.className = 'theory-tab' + (l === this.lesson ? ' active' : '');
      b.dataset.id = l.id;
      b.textContent = l.title[getLang()] || l.title.en;
      b.onclick = () => this.startLesson(l);
      tabs.appendChild(b);
    });
  },

  setupPiano(lesson) {
    const el = document.getElementById('th-piano');
    if (!el) return;
    const narrow = this._isNarrow();
    this._narrowBuilt = narrow;
    // Wide screens always get 3 octaves from C3. Narrow screens get 2 octaves
    // placed so every note this lesson can ask for is on the keyboard —
    // e.g. `intervals` reaches C5 while `minor-triad` reaches down to E3.
    const win = narrow ? this.pianoWindow(lesson || this.lesson) : null;
    if (this.piano) { this.piano.destroy(); this.piano = null; }
    this.piano = new PianoUI(el, {
      octaves: win ? win.octaves : 3,
      startOctave: win ? win.startOctave : 3,
      onNote: (n) => this.onPianoNote(n)
    });
  },

  _isNarrow() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
  },

  /* MIDI number of a note name. C4 = 60 (middle C). */
  _midiOf(name) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name || ''));
    if (!m) return NaN;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    const acc = m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0);
    return base + acc + (parseInt(m[3], 10) + 1) * 12;
  },

  /* Smallest 2-octave window that contains every note the lesson can ask for.
     Returns null when the lesson needs no keyboard (ear training is answered
     with buttons). */
  pianoWindow(lesson) {
    if (!lesson) return null;
    const T = window.TonoraTheory;
    if (!T) return null;
    const notes = [];
    const add = q => {
      const exp = T.expectedFor(lesson, q);
      if (Array.isArray(exp)) exp.forEach(n => notes.push(n));
    };
    if (lesson.type === 'note') lesson.pool.forEach(n => add(n));
    else if (lesson.type === 'interval') lesson.intervals.forEach(i => add({ interval: i }));
    else if (lesson.type === 'chord') lesson.roots.forEach(r => add({ root: r }));
    else if (lesson.type === 'scale') add({});
    else return null; // ear
    // the root is played too, so keep it visible alongside the answer
    if (lesson.root) notes.push(lesson.root);
    (lesson.roots || []).forEach(r => notes.push(r));

    const midis = notes.map(n => this._midiOf(n)).filter(Number.isFinite);
    if (!midis.length) return null;
    const lo = Math.min.apply(null, midis);
    const hi = Math.max.apply(null, midis);
    const startOctave = Math.max(1, Math.floor(lo / 12) - 1);
    const startMidi = (startOctave + 1) * 12; // MIDI of C in that octave
    const octaves = Math.max(2, Math.ceil((hi - startMidi + 1) / 12));
    return { startOctave, octaves };
  },

  startLesson(lesson) {
    this.lesson = lesson;
    this.stopPlayback();
    this.setupPiano(lesson);
    document.querySelectorAll('.theory-tab').forEach(b => b.classList.toggle('active', b.dataset.id === lesson.id));
    const blurb = document.getElementById('th-blurb');
    if (blurb) blurb.textContent = lesson.blurb[getLang()] || lesson.blurb.en;
    this.newQuestion();
  },

  newQuestion() {
    this.played = [];
    this.stopPlayback();
    const lesson = this.lesson;
    if (!lesson) return;
    const T = window.TonoraTheory;
    let promptAbc = '';
    let promptText = '';

    if (lesson.type === 'note') {
      const note = lesson.pool[Math.floor(Math.random() * lesson.pool.length)];
      this.question = { note };
      this.expected = [note];
      this.playNotes = [note];
      this.playIsChord = false;
      promptText = t('playThisNote');
      promptAbc = TonoraNotation.abcFromNotes([note], { qpm: 90 });
    } else if (lesson.type === 'interval') {
      const interval = lesson.intervals[Math.floor(Math.random() * lesson.intervals.length)];
      this.question = { interval };
      this.expected = T.expectedFor(lesson, this.question);
      this.playNotes = [lesson.root].concat(this.expected);
      this.playIsChord = false;
      promptText = `${t('playInterval')}: ${T.intervalLabel(interval)} ${t('above')} ${lesson.root.replace(/\d/, '')}`;
      promptAbc = TonoraNotation.abcFromNotes([lesson.root], { qpm: 90 });
    } else if (lesson.type === 'chord') {
      const root = lesson.roots[Math.floor(Math.random() * lesson.roots.length)];
      this.question = { root };
      this.expected = T.expectedFor(lesson, this.question);
      this.playNotes = this.expected;
      this.playIsChord = true;
      promptText = `${t('playChord')}: ${root.replace(/\d/, '')} ${lesson.quality === 'min' ? t('minor') : t('major')}`;
      promptAbc = TonoraNotation.abcChord(this.expected, { qpm: 80 });
    } else if (lesson.type === 'scale') {
      this.question = {};
      this.expected = T.expectedFor(lesson, this.question);
      this.playNotes = this.expected;
      this.playIsChord = false;
      promptText = `${t('playScale')}: ${lesson.scale}`;
      promptAbc = TonoraNotation.abcFromNotes(this.expected, { qpm: 96 });
    } else if (lesson.type === 'ear') {
      const roots = (lesson.roots && lesson.roots.length) ? lesson.roots : [lesson.root || 'C4'];
      const root = roots[Math.floor(Math.random() * roots.length)];
      const choice = lesson.pool[Math.floor(Math.random() * lesson.pool.length)];
      this.question = { root, choice };
      this.expected = T.expectedFor(lesson, this.question);
      this.playNotes = this.expected;
      this.playIsChord = lesson.kind === 'chord';
      promptText = t('whatDidYouHear');
      promptAbc = '';
    }

    this.promptText = promptText;
    const prompt = document.getElementById('th-prompt');
    if (prompt) prompt.textContent = promptText;
    const board = document.getElementById('th-board');
    if (lesson.type === 'ear') {
      this.visual = null;
      if (board) board.innerHTML = '<div class="theory-mystery">♪</div>';
    } else {
      this.visual = TonoraNotation.render(board, promptAbc);
    }
    this.renderActions();
  },

  earLabel(c) {
    const L = this.lesson;
    if (L && L.kind === 'chord') return c === 'min' ? t('minor') : t('major');
    const T = window.TonoraTheory;
    return (T && T.intervalLabel(c)) || c;
  },

  renderActions() {
    const actions = document.getElementById('th-actions');
    if (!actions) return;
    actions.innerHTML = '';
    const hear = document.createElement('button');
    hear.className = 'btn primary';
    hear.textContent = `▶ ${t('hearIt')}`;
    hear.onclick = () => this.playAnswer();
    const next = document.createElement('button');
    next.className = 'btn';
    next.textContent = `⏭️ ${t('skip')}`;
    next.onclick = () => this.newQuestion();
    actions.appendChild(hear);
    if (this.lesson && this.lesson.type === 'ear' && this.question) {
      this.lesson.pool.forEach(c => {
        const b = document.createElement('button');
        b.className = 'btn theory-choice';
        b.textContent = this.earLabel(c);
        b.onclick = () => this.judge(c === this.question.choice);
        actions.appendChild(b);
      });
    }
    actions.appendChild(next);
  },

  /* Render + animate the correct answer (also used as reward feedback). */
  playAnswer() {
    this.stopPlayback();
    const board = document.getElementById('th-board');
    if (!board) return;
    const abc = this.playIsChord
      ? TonoraNotation.abcChord(this.playNotes, { qpm: 80 })
      : TonoraNotation.abcFromNotes(this.playNotes, { qpm: 84 });
    this.visual = TonoraNotation.render(board, abc);
    if (!this.visual) return;
    this.playback = TonoraNotation.play(board, this.visual, {
      qpm: 84,
      onEvent: (names) => {
        this.clearHighlights();
        names.forEach(n => { if (this.piano) this.piano.highlight(n, true); });
      },
      onFinish: () => { this.clearHighlights(); this.playback = null; }
    });
  },

  onPianoNote(note) {
    if (!this.lesson) return;
    const T = window.TonoraTheory;
    const inst = this.inst();
    if (inst) window.TonoraAudio.playNote(inst, note);
    const type = this.lesson.type;
    if (type === 'ear') return;   // answer with the choice buttons, keys just play

    if (type === 'note' || type === 'interval') {
      this.judge(note === this.expected[0]);
      return;
    }
    if (type === 'chord') {
      if (!this.expected.includes(note)) { this.judge(false); return; }
      this.played.push(note);
      const uniq = [...new Set(this.played)];
      if (uniq.length >= this.expected.length) {
        this.judge(T.validateAnswer(this.lesson, this.question, uniq).correct);
      }
      return;
    }
    if (type === 'scale') {
      const i = this.played.length;
      if (note !== this.expected[i]) { this.judge(false); return; }
      this.played.push(note);
      if (this.played.length === this.expected.length) this.judge(true);
    }
  },

  judge(ok) {
    const prompt = document.getElementById('th-prompt');
    if (this._judgeTimer) { clearTimeout(this._judgeTimer); this._judgeTimer = null; }
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (ok) {
      this.streak++;
      this.score += 10 + this.streak * 2;
      if (prompt) prompt.textContent = `✅ ${t('correct')}`;
      this.updateScore();
      this.playAnswer();
      TonoraAchievements.unlock('theorist');
      this._judgeTimer = setTimeout(() => {
        this._judgeTimer = null;
        if (this.lesson) this.newQuestion();
      }, 1600);
    } else {
      this.streak = 0;
      this.played = [];
      if (prompt) prompt.textContent = `❌ ${t('tryAgain')}`;
      this.updateScore();
      this._retryTimer = setTimeout(() => {
        this._retryTimer = null;
        const p = document.getElementById('th-prompt');
        if (p && this.lesson) p.textContent = this.promptText;
      }, 900);
    }
  },

  clearHighlights() {
    if (!this.piano) return;
    for (const n in this.piano.keys) this.piano.highlight(n, false);
  },

  updateScore() {
    const el = document.getElementById('th-score');
    if (el) el.textContent = `⭐ ${this.score}  🔥 ${this.streak}`;
  },

  stopPlayback() {
    if (this.playback) { this.playback.stop(); this.playback = null; }
    if (this._judgeTimer) { clearTimeout(this._judgeTimer); this._judgeTimer = null; }
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    this.clearHighlights();
  },

  leave() {
    this.stopPlayback();
    if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
    this._narrowBuilt = null;
    if (this.piano) { this.piano.destroy(); this.piano = null; }
    this.visual = null;
    this.question = null;
  }
};
window.TheoryMode = TheoryMode;
