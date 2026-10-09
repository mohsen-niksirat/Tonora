/* Tonora — Learn mode: falling notes, listen then play.
   v2: metronome, 0.5×/1× speed, A–B repeat, canvas aligned to piano. */
'use strict';

const LearnMode = {
  song: null,
  piano: null,
  running: false,
  raf: 0,
  speed: 1,          // 0.5 or 1
  metronome: false,
  repeat: null,      // {startIdx, count} or null

  enter(root) {
    root.innerHTML = `
      <div class="song-list" id="song-list">
        <h2>${t('chooseSong')}</h2>
        <div id="songs"></div>
      </div>
      <div class="learn-stage hidden" id="learn-stage">
        <div class="learn-hud">
          <button class="btn" id="learn-back">← ${t('back')}</button>
          <button class="btn toggle" id="learn-metro">🥁 ${t('metronome')}</button>
          <button class="btn toggle" id="learn-speed">1×</button>
          <button class="btn toggle" id="learn-ab">🔁 ${t('next8')}</button>
          <button class="btn primary" id="learn-skip">⚡ ${t('skipListen')}</button>
          <div class="learn-status" id="learn-status"></div>
          <div class="learn-score" id="learn-score"></div>
        </div>
        <div class="learn-canvas-holder" id="learn-canvas-holder"><canvas id="fall-canvas"></canvas></div>
        <div id="learn-piano"></div>
        <div class="learn-modal hidden" id="learn-modal"></div>
      </div>
    `;
    const list = root.querySelector('#songs');
    window.TONORA_SONGS.forEach(song => {
      const card = document.createElement('button');
      card.className = 'song-card';
      const stars = '★'.repeat(song.difficulty) + '☆'.repeat(3 - song.difficulty);
      const best = localStorage.getItem('tonora-score-' + song.id);
      const bestText = best ? ` · 🏆 ${best}` : '';
      card.innerHTML = `<strong>${song.title[getLang()] || song.title.en}</strong>
        <small>${song.composer} · ${t('level')} ${stars}${bestText}</small>`;
      card.onclick = () => this.start(song);
      list.appendChild(card);
    });
    root.querySelector('#learn-back').onclick = () => { this.stop(); this.enter(root); };
    root.querySelector('#learn-metro').onclick = (e) => {
      this.metronome = !this.metronome;
      e.currentTarget.classList.toggle('active', this.metronome);
    };
    root.querySelector('#learn-speed').onclick = (e) => {
      this.speed = this.speed === 1 ? 0.5 : 1;
      e.currentTarget.textContent = this.speed === 1 ? '1×' : '0.5×';
      if (this.running && this.phase !== 'listen') {
        // rescale timeline to preserve current note position
        const nowP = performance.now();
        const beatP = (nowP - this.startTime) / (this.spb * 1000 / this._prevSpeed);
        this._prevSpeed = this.speed;
        this.spb = 60 / this.song.bpm / this.speed;
        this.startTime = nowP - beatP * this.spb * 1000;
      }
    };
    root.querySelector('#learn-ab').onclick = () => this.toggleRepeat();
  },

  /* pick "next 8 unhit notes" as loop range */
  toggleRepeat() {
    const btn = document.getElementById('learn-ab');
    if (this.repeat) {
      this.repeat = null;
      btn.classList.remove('active');
      btn.textContent = `🔁 ${t('next8')}`;
      return;
    }
    let firstUnhit = this.song.notes.findIndex((n, i) => !this.hitIdx || !this.hitIdx.has(i));
    if (firstUnhit < 0) firstUnhit = 0;
    this.repeat = { startIdx: firstUnhit, count: Math.min(8, this.song.notes.length - firstUnhit) };
    btn.classList.add('active');
    btn.textContent = `🔁 ${t('repeatOn')}`;
    // restart play phase from the loop start
    if (this.running && this.phase !== 'listen') {
      const spb = this.spb;
      this.phase = 'play';
      this.startTime = performance.now() + 1200 - this.song.notes[this.repeat.startIdx].t * spb * 1000; // 1.2s lead-in
      this.hitIdx = new Set();
      this.combo = 0;
      this.setScore();
    }
  },

  start(song) {
    this.stop();
    this.song = song;
    this.running = true;
    this.score = 0; this.combo = 0;
    this.phase = 'listen';
    this._listenTimers = [];
    this._scheduledVoices = [];
    document.getElementById('song-list').classList.add('hidden');
    document.getElementById('learn-stage').classList.remove('hidden');
    const surf = document.getElementById('learn-piano');
    this.piano = new PianoUI(surf, { octaves: 2, startOctave: 3, onNote: (n) => this.onUserNote(n) });
    const inst = window.TONORA_INSTRUMENTS.find(i => i.id === 'piano');
    this.inst = inst;
    this.setupCanvas();
    this.setStatus(t('listen'));
    const spb = 60 / song.bpm / this.speed;
    const ctx = window.TonoraAudio.ensure();
    const t0 = ctx.currentTime + 0.5;

    this.maxCombo = 0;
    this.totalHits = 0;
    const skipBtn = document.getElementById('learn-skip');
    if (skipBtn) {
      skipBtn.classList.remove('hidden');
      skipBtn.onclick = () => {
        if (this.phase === 'listen') {
          if (this._listenTimers) this._listenTimers.forEach(t => clearTimeout(t));
          if (this._scheduledVoices) this._scheduledVoices.forEach(v => { try { if (v && v.stop) v.stop(); } catch (e) {} });
          clearTimeout(this._listenTimer);
          skipBtn.classList.add('hidden');
          this.beginPlay(spb);
        }
      };
    }

    // Schedule each note to play at its correct future timestamp
    song.notes.forEach(n => {
      const voice = window.TonoraAudio.scheduleNote(
        ctx,
        window.TonoraAudio.master,
        window.TonoraAudio.reverb,
        inst,
        n.n,
        n.d * spb * 0.9,
        0.8,
        t0 + n.t * spb
      );
      if (voice) this._scheduledVoices.push(voice);
      const delayMs = (0.5 + n.t * spb) * 1000;
      const tid = setTimeout(() => {
        if (this.running && this.phase === 'listen') this.piano.flash(n.n);
      }, delayMs);
      this._listenTimers.push(tid);
    });

    // Metronome clicks during listen phase
    const totalBeats = Math.ceil((song.notes[song.notes.length - 1].t + song.notes[song.notes.length - 1].d) / 1) + 2;
    for (let b = 0; b < totalBeats; b++) {
      const delayMs = (0.5 + b * spb) * 1000;
      const tid = setTimeout(() => {
        if (this.running && this.phase === 'listen' && this.metronome) this.click(b % 4 === 0);
      }, delayMs);
      this._listenTimers.push(tid);
    }
    const listenDur = (song.notes[song.notes.length - 1].t + song.notes[song.notes.length - 1].d) * spb * 1000 + 800;
    this._listenTimer = setTimeout(() => { if (this.running) this.beginPlay(spb); }, listenDur);
  },

  /* short synthesized metronome tick */
  click(accent) {
    const ctx = window.TonoraAudio.ensure();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = accent ? 1600 : 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.06);
  },

  beginPlay(spb) {
    const skipBtn = document.getElementById('learn-skip');
    if (skipBtn) skipBtn.classList.add('hidden');
    this.spb = spb;
    this._prevSpeed = this.speed;
    this.phase = 'wait';
    this.startTime = performance.now() + 2500;
    this.setStatus(t('yourTurn'));
    this.hitIdx = new Set();
    this._lastBeat = -1;
    this.loop();
  },

  setupCanvas() {
    const cv = document.getElementById('fall-canvas');
    const holder = document.getElementById('learn-canvas-holder');
    const pianoEl = document.getElementById('learn-piano');
    const size = () => {
      const w = pianoEl.offsetWidth || holder.clientWidth;
      cv.width = w * devicePixelRatio;
      cv.height = holder.clientHeight * devicePixelRatio;
      cv.style.width = w + 'px';
      cv.style.height = holder.clientHeight + 'px';
      cv.style.left = '0px';
      // cache per-note horizontal geometry once (avoid per-frame layout thrash)
      this.measureKeys();
    };
    size();
    this.ctx2d = cv.getContext('2d');
    this._measureRaf = 0;
    this._onResize = () => {
      if (!this.running) return;
      cancelAnimationFrame(this._measureRaf);
      this._measureRaf = requestAnimationFrame(size);
    };
    window.addEventListener('resize', this._onResize);
  },

  /* Snapshot every key's x/width relative to the canvas, in device pixels. */
  measureKeys() {
    if (!this.piano) return;
    const holder = document.getElementById('learn-canvas-holder');
    const hr = holder.getBoundingClientRect();
    const dpr = devicePixelRatio;
    const m = {};
    for (const note in this.piano.keys) {
      const kr = this.piano.keys[note].getBoundingClientRect();
      m[note] = { x: (kr.left - hr.left) * dpr, w: kr.width * dpr };
    }
    this._keyRects = m;
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
    // scoring window scales with speed
    const win = 350 / this.speed;
    if (best && bestD < win && (best.n.n === note)) {
      this.hitIdx.add(best.i);
      this.totalHits = (this.totalHits || 0) + 1;
      this.combo++;
      if (this.combo > (this.maxCombo || 0)) this.maxCombo = this.combo;
      const pts = bestD < 120 / this.speed ? 100 : 50;
      this.score += pts + this.combo * 5;
      this.setStatus(bestD < 120 / this.speed ? t('perfect') : t('good'));
      if (this.combo >= 100) TonoraAchievements.unlock('combo100');
    } else {
      this.combo = 0;
    }
    this.setScore();
    // finished (or loop range finished)?
    const total = this.repeat ? this.repeat.startIdx + this.repeat.count : this.song.notes.length;
    const inRange = this.repeat
      ? this.song.notes.every((n, i) => i < this.repeat.startIdx || this.hitIdx.has(i) || i >= total)
      : this.hitIdx.size >= this.song.notes.length;
    if (inRange && this.hitIdx.size >= this.song.notes.filter((n, i) => !this.repeat || (i >= this.repeat.startIdx && i < total)).length) {
      if (this.repeat) {
        // loop the range
        this.startTime = performance.now() + 1500 - this.song.notes[this.repeat.startIdx].t * spb * 1000;
        for (let i = this.repeat.startIdx; i < total; i++) this.hitIdx.delete(i);
        this.setStatus(`🔁 ${t('repeatOn')}`);
      } else {
        const savedBest = +localStorage.getItem('tonora-score-' + this.song.id) || 0;
        if (this.score > savedBest) {
          localStorage.setItem('tonora-score-' + this.song.id, this.score);
        }
        this.setStatus(`🎉 ${t('score')}: ${this.score}`);
        this.phase = 'done';
        TonoraAchievements.unlock('first_song');
        this.showSummaryModal();
      }
    }
  },

  loop() {
    if (!this.running) return;
    const now = performance.now();
    const spb = this.spb;
    if (this.phase === 'wait' && now >= this.startTime - 1200) { this.phase = 'play'; }
    if (this.phase === 'play') {
      // metronome clicks on each beat
      const beat = Math.floor((now - this.startTime) / (spb * 1000));
      if (this.metronome && beat !== this._lastBeat && beat >= 0) {
        this._lastBeat = beat;
        this.click(beat % 4 === 0);
      }
      const win = 400 / this.speed;
      this.song.notes.forEach((n, i) => {
        if (!this.hitIdx.has(i) && now > this.startTime + n.t * spb * 1000 + win) {
          this.hitIdx.add(i);
          this.combo = 0;
          this.setStatus(t('miss'));
        }
      });
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
    const dpr = devicePixelRatio;
    this.song.notes.forEach((n, i) => {
      const target = this.startTime + n.t * spb * 1000;
      const y = H - ((target - now) / lookAhead) * H;
      if (y < -50 || y > H + 50) return;
      const rect = this._keyRects && this._keyRects[n.n];
      if (!rect) return;
      const x = rect.x, w = rect.w;
      const hit = this.hitIdx.has(i);
      c.fillStyle = hit ? 'rgba(120,220,150,0.9)' : 'rgba(120,170,255,0.9)';
      const h = Math.max(n.d * spb * 1000 / lookAhead * H * 0.4, 14 * dpr);
      c.beginPath();
      c.roundRect(x, y - h, w, h, 6);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.strokeRect(x, y - h, w, h);
    });
  },

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this._measureRaf);
    clearTimeout(this._listenTimer);
    if (this._listenTimers) {
      this._listenTimers.forEach(t => clearTimeout(t));
      this._listenTimers = [];
    }
    if (this._scheduledVoices) {
      this._scheduledVoices.forEach(v => { try { if (v && v.stop) v.stop(); } catch (e) {} });
      this._scheduledVoices = [];
    }
    if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
    if (this.piano) { this.piano.destroy(); this.piano = null; }
    const btn = document.getElementById('learn-ab');
    if (btn) { btn.classList.remove('active'); btn.textContent = `🔁 ${t('next8')}`; }
    const skipBtn = document.getElementById('learn-skip');
    if (skipBtn) skipBtn.classList.add('hidden');
    const modal = document.getElementById('learn-modal');
    if (modal) { modal.classList.add('hidden'); modal.innerHTML = ''; }
    this.repeat = null;
  },

  showSummaryModal() {
    const modal = document.getElementById('learn-modal');
    if (!modal || !this.song) return;
    const totalNotes = this.song.notes.length;
    const accuracy = Math.min(100, Math.round(((this.totalHits || 0) / totalNotes) * 100));
    const starsCount = accuracy >= 85 ? 3 : (accuracy >= 60 ? 2 : 1);
    const stars = '★'.repeat(starsCount) + '☆'.repeat(3 - starsCount);
    const best = localStorage.getItem('tonora-score-' + this.song.id) || this.score;

    const currentIdx = window.TONORA_SONGS.findIndex(s => s.id === this.song.id);
    const nextSong = window.TONORA_SONGS[(currentIdx + 1) % window.TONORA_SONGS.length];

    modal.classList.remove('hidden');
    modal.innerHTML = `
      <div class="summary-card">
        <h3>🎉 ${t('lessonComplete')}</h3>
        <div class="summary-stars">${stars}</div>
        <div class="summary-grid">
          <div class="sum-item"><small>${t('score')}</small><strong>${this.score}</strong></div>
          <div class="sum-item"><small>${t('accuracy')}</small><strong>${accuracy}%</strong></div>
          <div class="sum-item"><small>${t('maxCombo')}</small><strong>🔥 ${this.maxCombo || 0}</strong></div>
          <div class="sum-item"><small>🏆 Best</small><strong>${best}</strong></div>
        </div>
        <div class="summary-actions">
          <button class="btn primary" id="sum-replay">🔄 ${t('playAgain')}</button>
          <button class="btn" id="sum-next">⏭️ ${t('nextSong')}</button>
          <button class="btn" id="sum-list">📋 ${t('songsList')}</button>
        </div>
      </div>
    `;
    modal.querySelector('#sum-replay').onclick = () => { modal.classList.add('hidden'); this.start(this.song); };
    modal.querySelector('#sum-next').onclick = () => { modal.classList.add('hidden'); this.start(nextSong); };
    modal.querySelector('#sum-list').onclick = () => { modal.classList.add('hidden'); this.stop(); this.enter(document.getElementById('app')); };
  },

  leave() { this.stop(); }
};
