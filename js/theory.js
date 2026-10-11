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
    this.setupPiano();
    if (!window.TonoraNotation || !window.TonoraNotation.available()) {
      const board = document.getElementById('th-board');
      if (board) board.innerHTML = `<p class="muted">${t('theoryOffline')}</p>`;
    }
    this.updateScore();
    if (this.lesson) this.startLesson(this.lesson);
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

  setupPiano() {
    const el = document.getElementById('th-piano');
    if (!el) return;
    this.piano = new PianoUI(el, {
      octaves: 3,
      startOctave: 3,
      onNote: (n) => this.onPianoNote(n)
    });
  },

  startLesson(lesson) {
    this.lesson = lesson;
    this.stopPlayback();
    document.querySelectorAll('.theory-tab').forEach(b => b.classList.toggle('active', b.dataset.id === lesson.id));
    const blurb = document.getElementById('th-blurb');
    if (blurb) blurb.textContent = lesson.blurb[getLang()] || lesson.blurb.en;
    this.newQuestion();
  },

  newQuestion() {
    this.played = [];
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
    }

    this.promptText = promptText;
    const prompt = document.getElementById('th-prompt');
    if (prompt) prompt.textContent = promptText;
    const board = document.getElementById('th-board');
    this.visual = TonoraNotation.render(board, promptAbc);
    this.renderActions();
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
    if (ok) {
      this.streak++;
      this.score += 10 + this.streak * 2;
      if (prompt) prompt.textContent = `✅ ${t('correct')}`;
      this.updateScore();
      this.playAnswer();
      TonoraAchievements.unlock('theorist');
      setTimeout(() => { if (this.lesson) this.newQuestion(); }, 1600);
    } else {
      this.streak = 0;
      this.played = [];
      if (prompt) prompt.textContent = `❌ ${t('tryAgain')}`;
      this.updateScore();
      setTimeout(() => {
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
    this.clearHighlights();
  },

  leave() {
    this.stopPlayback();
    if (this.piano) { this.piano.destroy(); this.piano = null; }
    this.visual = null;
    this.question = null;
  }
};
window.TheoryMode = TheoryMode;
