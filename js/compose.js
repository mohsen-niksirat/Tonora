/* Tonora — Compose mode: multi-track step sequencer / piano roll.
   v2: chords (multi-note steps), global velocity, WAV export. */
'use strict';

const ComposeMode = {
  bpm: 120,
  steps: 32,          // 32 sixteenth steps = 2 bars
  tracks: {},         // melody/bass: array of string|null (old) or array of arrays (chords); drums: bool[]
  velocity: 0.8,
  playing: false,
  timer: null,
  step: 0,

  enter(root) {
    this.tracks = { melody: new Array(this.steps).fill(null), drums: new Array(this.steps).fill(false), bass: new Array(this.steps).fill(null) };
    this.loadSaved();
    root.innerHTML = `
      <div class="compose-hud">
        <button class="btn" id="cmp-play">▶</button>
        <button class="btn" id="cmp-stop">■</button>
        <label>${t('tempo')}: <input type="number" id="cmp-bpm" min="40" max="240" value="${this.bpm}" style="width:5em"></label>
        <label>${t('velocity')}: <input type="range" id="cmp-vel" min="0.4" max="1" step="0.05" value="${this.velocity}" style="width:7em"></label>
        <button class="btn" id="cmp-save">${t('save')}</button>
        <button class="btn" id="cmp-export">${t('export')}</button>
        <button class="btn" id="cmp-wav">${t('exportWav')}</button>
        <label class="btn file-btn">${t('import')}<input type="file" id="cmp-import" accept=".json" hidden></label>
        <button class="btn danger" id="cmp-clear">${t('clear')}</button>
      </div>
      <div class="roll-wrap" id="roll"></div>
    `;
    root.querySelector('#cmp-play').onclick = () => this.togglePlay();
    root.querySelector('#cmp-stop').onclick = () => this.stop();
    root.querySelector('#cmp-bpm').onchange = e => { this.bpm = +e.target.value || 120; };
    root.querySelector('#cmp-vel').oninput = e => { this.velocity = +e.target.value; this.tracks.velocity = this.velocity; };
    root.querySelector('#cmp-save').onclick = () => this.save();
    root.querySelector('#cmp-export').onclick = () => this.exportSong();
    root.querySelector('#cmp-wav').onclick = () => this.exportWav();
    root.querySelector('#cmp-import').onchange = e => this.importSong(e.target.files[0]);
    root.querySelector('#cmp-clear').onclick = () => { this.tracks = { melody: new Array(this.steps).fill(null), drums: new Array(this.steps).fill(false), bass: new Array(this.steps).fill(null), velocity: this.velocity }; this.buildRoll(); };
    this.buildRoll();
  },

  loadSaved() {
    try {
      const raw = localStorage.getItem('tonora-compose');
      if (raw) {
        const d = JSON.parse(raw);
        if (d.tracks) { this.tracks = this.normalizeTracks(d.tracks); this.bpm = d.bpm || 120; }
        if (d.tracks && d.tracks.velocity !== undefined) this.velocity = d.tracks.velocity;
      }
    } catch (e) {}
  },

  /* backward-compat: old format stores string|null per step; chords stored as arrays */
  normalizeTracks(tr) {
    const fix = arr => (arr || []).map(v => Array.isArray(v) ? v : v);
    return { melody: fix(tr.melody), drums: tr.drums || [], bass: fix(tr.bass), velocity: tr.velocity };
  },

  buildRoll() {
    const roll = document.getElementById('roll');
    roll.innerHTML = '';
    const notes = ['C5','B4','A4','G4','F4','E4','D4','C4']; // melody rows
    const bassNotes = ['C3','A2','F2','G2'];
    const mkRow = (label, cells) => {
      const row = document.createElement('div');
      row.className = 'roll-row';
      const lab = document.createElement('div');
      lab.className = 'roll-label';
      lab.textContent = label;
      row.appendChild(lab);
      cells.forEach((cell) => row.appendChild(cell));
      roll.appendChild(row);
    };
    const mkCell = (cls, on, cb, text='') => {
      const c = document.createElement('button');
      c.className = 'roll-cell ' + cls + (on ? ' on' : '');
      if (text) c.textContent = text;
      c.onclick = cb;
      return c;
    };
    // melody rows — chords: each row toggles independently
    notes.forEach(n => {
      const cells = this.tracks.melody.map((v, s) =>
        mkCell('mel', this.stepHas(v, n), () => this.toggleNote('melody', s, n, 'piano', 0.3)));
      mkRow(n, cells);
    });
    // drums row
    const drumDefs = window.TONORA_INSTRUMENTS.find(i => i.id === 'drums');
    const dcells = this.tracks.drums.map((v, s) =>
      mkCell('drm', v, () => {
        this.tracks.drums[s] = !this.tracks.drums[s];
        this.buildRoll();
        if (this.tracks.drums[s]) window.TonoraAudio.playDrum(drumDefs, 'kick', 0.9);
      }, '🥁'));
    mkRow(t('drums'), dcells);
    // bass rows
    bassNotes.forEach(n => {
      const cells = this.tracks.bass.map((v, s) =>
        mkCell('bass', this.stepHas(v, n), () => this.toggleNote('bass', s, n, 'synth', 0.3)));
      mkRow(n, cells);
    });
  },

  stepHas(v, n) {
    if (Array.isArray(v)) return v.includes(n);
    return v === n;
  },

  toggleNote(track, s, n, instId, previewDur) {
    const arr = this.tracks[track];
    if (Array.isArray(arr[s])) {
      const i = arr[s].indexOf(n);
      if (i >= 0) arr[s].splice(i, 1);
      else arr[s].push(n);
      if (arr[s].length === 0) arr[s] = null;
    } else if (arr[s] === n) {
      arr[s] = null;
    } else if (arr[s] === null) {
      arr[s] = n;
    } else {
      arr[s] = [arr[s], n]; // second note on the same step → chord
    }
    this.buildRoll();
    if (this.stepHas(arr[s], n) || (Array.isArray(arr[s]) && arr[s].includes(n))) {
      window.TonoraAudio.playNote(this.inst(instId), n, previewDur, this.velocity);
    }
  },

  inst(id) { return window.TONORA_INSTRUMENTS.find(i => i.id === id); },

  stepDur() { return 60 / this.bpm / 4; }, // sixteenth

  togglePlay() { this.playing ? this.stop() : this.start(); },

  start() {
    window.TonoraAudio.ensure();
    this.playing = true;
    this.step = 0;
    // cache row elements once — no per-tick DOM queries, no O(rows²) clearing
    const rows = [...document.querySelectorAll('.roll-row')];
    let prevCells = [];
    const tick = () => {
      if (!this.playing) return;
      this.playStep(this.step);
      const s = this.step;
      prevCells.forEach(c => c.classList.remove('cur'));
      prevCells = rows.map(row => row.children[1 + s]).filter(Boolean);
      prevCells.forEach(c => c.classList.add('cur'));
      this.step = (this.step + 1) % this.steps;
      this.timer = setTimeout(tick, this.stepDur() * 1000);
    };
    tick();
  },

  playStep(s) {
    const vel = this.velocity;
    const m = this.tracks.melody[s];
    if (m) (Array.isArray(m) ? m : [m]).forEach(n =>
      window.TonoraAudio.playNote(this.inst('piano'), n, this.stepDur() * 2, vel));
    const b = this.tracks.bass[s];
    if (b) (Array.isArray(b) ? b : [b]).forEach(n =>
      window.TonoraAudio.playNote(this.inst('synth'), n, this.stepDur() * 3, vel));
    if (this.tracks.drums[s]) {
      const d = this.inst('drums');
      window.TonoraAudio.playDrum(d, s % 8 === 0 ? 'kick' : (s % 4 === 2 ? 'snare' : 'hat'), vel);
    }
  },

  stop() {
    this.playing = false;
    clearTimeout(this.timer);
    document.querySelectorAll('.roll-cell.cur').forEach(c => c.classList.remove('cur'));
  },

  save() {
    this.tracks.velocity = this.velocity;
    localStorage.setItem('tonora-compose', JSON.stringify({ bpm: this.bpm, tracks: this.tracks }));
    const b = document.getElementById('cmp-save');
    b.textContent = '✓';
    setTimeout(() => b.textContent = t('save'), 1200);
    TonoraAchievements.unlock('composer');
  },

  exportSong() {
    this.tracks.velocity = this.velocity;
    const data = JSON.stringify({ app: 'tonora', type: 'song', bpm: this.bpm, tracks: this.tracks }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tonora-song.json';
    a.click();
  },

  async exportWav() {
    const btn = document.getElementById('cmp-wav');
    btn.disabled = true;
    btn.textContent = t('rendering');
    try {
      const blob = await window.renderCompositionToWav(this.tracks, this.bpm, this.steps);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tonora-composition.wav';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      TonoraAchievements.unlock('exporter');
    } finally {
      btn.disabled = false;
      btn.textContent = t('exportWav');
    }
  },

  importSong(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d.type === 'song' && d.tracks) {
          this.tracks = this.normalizeTracks(d.tracks);
          if (d.tracks.velocity !== undefined) { this.velocity = d.tracks.velocity; document.getElementById('cmp-vel').value = this.velocity; }
          this.bpm = d.bpm || 120;
          document.getElementById('cmp-bpm').value = this.bpm;
          this.buildRoll();
        }
      } catch (e) { alert('Invalid file'); }
    };
    r.readAsText(file);
  },

  leave() { this.stop(); this.save(); }
};
