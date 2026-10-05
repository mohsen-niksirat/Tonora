/* Tonora — Learn mode: falling notes, listen then play */
'use strict';

const LearnMode = {
  song: null,
  piano: null,
  running: false,
  raf: 0,

  enter(root) {
    root.innerHTML = `
      <div class="song-list" id="song-list">
        <h2>${t('chooseSong')}</h2>
        <div id="songs"></div>
      </div>
      <div class="learn-stage hidden" id="learn-stage">
        <div class="learn-hud">
          <button class="btn" id="learn-back">← ${t('back')}</button>
          <div class="learn-status" id="learn-status"></div>
          <div class="learn-score" id="learn-score"></div>
        </div>
        <div class="fall-area" id="fall-area"><canvas id="fall-canvas"></canvas></div>
        <div id="learn-piano"></div>
      </div>
    `;
    const list = root.querySelector('#songs');
    window.TONORA_SONGS.forEach(song => {
      const card = document.createElement('button');
      card.className = 'song-card';
      const stars = '★'.repeat(song.difficulty) + '☆'.repeat(3 - song.difficulty);
      card.innerHTML = `<strong>${song.title[getLang()] || song.title.en}</strong>
        <small>${song.composer} · ${t('level')} ${stars}</small>`;
      card.onclick = () => this.start(song);
      list.appendChild(card);
    });
    root.querySelector('#learn-back').onclick = () => { this.stop(); this.enter(root); };
  },

  start(song) {
    this.song = song;
    this.running = true;
    this.score = 0; this.combo = 0;
    this.phase = 'listen'; this.phaseNoteIdx = 0;
    document.getElementById('song-list').classList.add('hidden');
    document.getElementById('learn-stage').classList.remove('hidden');
    const surf = document.getElementById('learn-piano');
    this.piano = new PianoUI(surf, { octaves: 2, startOctave: 3, onNote: (n) => this.onUserNote(n) });
    const inst = window.TONORA_INSTRUMENTS.find(i => i.id === 'piano');
    this.inst = inst;
    this.setupCanvas();
    this.setStatus(t('listen'));
    // schedule listen-through playback
    const spb = 60 / song.bpm; // seconds per beat
    const t0 = window.TonoraAudio.ensure().currentTime + 0.5;
    song.notes.forEach(n => {
      window.TonoraAudio.playNote(inst, n.n, n.d * spb * 0.9);
      setTimeout(() => { if (this.running) this.piano.flash(n.n); }, (t0 - window.TonoraAudio.ctx.currentTime + n.t * spb) * 1000);
    });
    const listenDur = (song.notes[song.notes.length - 1].t + song.notes[song.notes.length - 1].d) * spb * 1000 + 800;
    this._listenTimer = setTimeout(() => { if (this.running) this.beginPlay(spb); }, listenDur);
  },

  beginPlay(spb) {
    this.spb = spb;
    this.phase = 'wait';
    this.startTime = performance.now() + 2500;
    this.setStatus(t('yourTurn'));
    this.noteIdx = 0;
    this.hitIdx = new Set();
    this.loop();
  },

  setupCanvas() {
    const cv = document.getElementById('fall-canvas');
    const area = document.getElementById('fall-area');
    cv.width = area.clientWidth * devicePixelRatio;
    cv.height = area.clientHeight * devicePixelRatio;
    cv.style.width = area.clientWidth + 'px';
    cv.style.height = area.clientHeight + 'px';
    this.ctx2d = cv.getContext('2d');
  },

  setStatus(s) { document.getElementById('learn-status').textContent = s; },
  setScore() { document.getElementById('learn-score').textContent = `⭐ ${this.score}  🔥 ${this.combo}`; },

  onUserNote(note) {
    if (this.phase !== 'play' || !this.song) return;
    window.TonoraAudio.playNote(this.inst, note);
    const now = performance.now();
    const spb = this.spb;
    // find nearest unhit note
    let best = null, bestD = Infinity;
    this.song.notes.forEach((n, i) => {
      if (this.hitIdx.has(i)) return;
      const target = this.startTime + n.t * spb * 1000;
      const d = Math.abs(now - target);
      if (d < bestD) { bestD = d; best = { n, i, target }; }
    });
    if (best && bestD < 350 && (best.n.n === note)) {
      this.hitIdx.add(best.i);
      this.combo++;
      const pts = bestD < 120 ? 100 : 50;
      this.score += pts + this.combo * 5;
      this.setStatus(bestD < 120 ? t('perfect') : t('good'));
    } else {
      this.combo = 0;
    }
    this.setScore();
    // finished?
    if (this.hitIdx.size >= this.song.notes.length) {
      this.setStatus(`🎉 ${this.score}`);
      this.phase = 'done';
    }
  },

  loop() {
    if (!this.running) return;
    const now = performance.now();
    const spb = this.spb;
    if (this.phase === 'wait' && now >= this.startTime - 1200) { this.phase = 'play'; }
    if (this.phase === 'play') {
      // auto-play missed notes softly? no — just mark misses
      this.song.notes.forEach((n, i) => {
        if (!this.hitIdx.has(i) && now > this.startTime + n.t * spb * 1000 + 400) {
          this.hitIdx.add(i);
          this.combo = 0;
          this.setStatus(t('miss'));
        }
      });
      if (this.hitIdx.size >= this.song.notes.length) this.phase = 'done';
    }
    this.draw(now, spb);
    this.raf = requestAnimationFrame(() => this.loop());
  },

  draw(now, spb) {
    const c = this.ctx2d;
    if (!c) return;
    const W = c.canvas.width, H = c.canvas.height;
    c.clearRect(0, 0, W, H);
    if (!this.song) return;
    const lookAhead = 2500; // ms of travel
    this.song.notes.forEach((n, i) => {
      const target = this.startTime + n.t * spb * 1000;
      const y = H - ((target - now) / lookAhead) * H;
      if (y < -50 || y > H + 50) return;
      const el = this.piano.keys[n.n];
      if (!el) return;
      const x = el.offsetLeft, w = el.offsetWidth;
      const hit = this.hitIdx.has(i);
      c.fillStyle = hit ? 'rgba(120,220,150,0.9)' : 'rgba(120,170,255,0.9)';
      const h = Math.max(n.d * spb * 1000 / lookAhead * H * 0.4, 14 * devicePixelRatio);
      c.beginPath();
      c.roundRect(x * devicePixelRatio, y - h, w * devicePixelRatio, h, 6);
      c.fill();
      // hit line glow
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.strokeRect(x * devicePixelRatio, y - h, w * devicePixelRatio, h);
    });
  },

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this._listenTimer);
    if (this.piano) { this.piano.destroy(); this.piano = null; }
  },

  leave() { this.stop(); }
};
