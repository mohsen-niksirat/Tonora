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
    this.muted = { melody: false, drums: false, bass: false };
    this.loadSaved();
    root.innerHTML = `
      <div class="compose-hud">
        <button class="btn" id="cmp-play">▶</button>
        <button class="btn" id="cmp-stop">■</button>
        <label>${t('tempo')}: <input type="number" id="cmp-bpm" min="40" max="240" value="${this.bpm}" style="width:5em"></label>
        <label>${t('velocity')}: <input type="range" id="cmp-vel" min="0.4" max="1" step="0.05" value="${this.velocity}" style="width:7em"></label>
        <span class="cmp-dur" id="cmp-dur" title="${t('duration')}"></span>
        <select class="btn" id="cmp-presets" style="font-size:0.8rem; padding:0.35rem 0.5rem">
          <option value="">✨ ${t('presets')}</option>
          <option value="pop">Pop Groove</option>
          <option value="synthwave">Synthwave</option>
          <option value="lofi">Lofi Chill</option>
        </select>
        <button class="btn toggle" id="cmp-swing" title="Swing Rhythm">🎵 Swing</button>
        <button class="btn" id="cmp-mixer-btn">🎚️ Mixer</button>
        <button class="btn toggle" id="mute-mel" title="Mute melody">🎹 ${t('melody')}</button>
        <button class="btn toggle" id="mute-drm" title="Mute drums">🥁 ${t('drums')}</button>
        <button class="btn toggle" id="mute-bass" title="Mute bass">🌈 ${t('bass')}</button>
        <button class="btn" id="cmp-save">${t('save')}</button>
        <button class="btn" id="cmp-export">${t('export')}</button>
        <button class="btn" id="cmp-wav">${t('exportWav')}</button>
        <label class="btn file-btn">${t('import')}<input type="file" id="cmp-import" accept=".json" hidden></label>
        <button class="btn danger" id="cmp-clear">${t('clear')}</button>
      </div>
      <div id="cmp-mixer-panel" class="hidden" style="background:var(--bg2); padding:1rem; border-radius:0.5rem; margin-bottom:1rem; display:flex; gap:1.5rem; border:1px solid rgba(255,255,255,0.1)">
      </div>
      <div class="roll-wrap" id="roll"></div>
    `;
    root.querySelector('#cmp-play').onclick = () => this.togglePlay();
    root.querySelector('#cmp-stop').onclick = () => this.stop();
    root.querySelector('#cmp-bpm').onchange = e => {
      this.bpm = Math.max(40, Math.min(240, +e.target.value || 120));
      e.target.value = this.bpm;
      this.updateDuration();
    };
    root.querySelector('#cmp-vel').oninput = e => { this.velocity = +e.target.value; this.tracks.velocity = this.velocity; };
    const swingBtn = root.querySelector('#cmp-swing');
    if (this.swing) swingBtn.classList.add('active');
    swingBtn.onclick = () => {
      this.swing = !this.swing;
      swingBtn.classList.toggle('active', this.swing);
    };
    root.querySelector('#cmp-presets').onchange = e => {
      if (e.target.value) { this.loadPreset(e.target.value); e.target.value = ''; }
    };
    const wireMute = (id, key) => {
      const b = root.querySelector('#' + id);
      b.onclick = () => {
        this.muted[key] = !this.muted[key];
        b.classList.toggle('active', !this.muted[key]);
        b.style.opacity = this.muted[key] ? '0.45' : '1';
      };
      b.classList.add('active');
    };
    wireMute('mute-mel', 'melody');
    wireMute('mute-drm', 'drums');
    wireMute('mute-bass', 'bass');
    root.querySelector('#cmp-save').onclick = () => this.save();
    root.querySelector('#cmp-export').onclick = () => this.exportSong();
    root.querySelector('#cmp-wav').onclick = () => this.exportWav();
    root.querySelector('#cmp-import').onchange = e => this.importSong(e.target.files[0]);
    root.querySelector('#cmp-clear').onclick = () => {
      if (confirm(t('confirmClear'))) {
        this.tracks = this.normalizeTracks({ melody: [], bass: [], drums: { kick:[], snare:[], hat:[] }, velocity: this.velocity });
        this.buildRoll();
      }
    };
    
    // Mixer Logic
    const mixerBtn = root.querySelector('#cmp-mixer-btn');
    const mixerPanel = root.querySelector('#cmp-mixer-panel');
    mixerBtn.onclick = () => {
      mixerPanel.classList.toggle('hidden');
      mixerBtn.classList.toggle('active');
    };
    
    const buildMixerUI = () => {
      mixerPanel.innerHTML = '';
      const mkStrip = (id, name, icon) => {
        const mix = this.tracks.mixer[id] || { vol: 1, pan: 0 };
        const el = document.createElement('div');
        el.style.display = 'flex'; el.style.flexDirection = 'column'; el.style.gap = '0.5rem'; el.style.alignItems = 'center';
        el.innerHTML = `
          <strong>${icon} ${name}</strong>
          <label style="font-size:0.75rem; color:var(--muted)">Vol: <input type="range" class="${id}-vol" min="0" max="2" step="0.1" value="${mix.vol}" style="width:50px"></label>
          <label style="font-size:0.75rem; color:var(--muted)">Pan: <input type="range" class="${id}-pan" min="-1" max="1" step="0.1" value="${mix.pan}" style="width:50px"></label>
        `;
        el.querySelector(`.${id}-vol`).oninput = e => { this.tracks.mixer[id].vol = +e.target.value; };
        el.querySelector(`.${id}-pan`).oninput = e => { this.tracks.mixer[id].pan = +e.target.value; };
        mixerPanel.appendChild(el);
      };
      if (!this.tracks.mixer) this.tracks.mixer = { melody: {vol:1,pan:0}, bass: {vol:1,pan:0}, drums: {vol:1,pan:0} };
      mkStrip('melody', t('melody'), '🎹');
      mkStrip('drums', t('drums'), '🥁');
      mkStrip('bass', t('bass'), '🌈');
    };
    buildMixerUI();
    this.buildMixerUI = buildMixerUI;

    this.buildRoll();
    this.updateDuration();
  },

  loadPreset(key) {
    const PRESETS = {
      pop: {
        bpm: 120, velocity: 0.85,
        tracks: {
          melody: [
            'C5', null, 'E4', null, 'G4', null, 'C5', null,
            'D4', null, 'F4', null, 'A4', null, 'D4', null,
            'E4', null, 'G4', null, 'C5', null, 'E4', null,
            'G4', null, ['E4','C4'], null, 'G4', null, 'C5', null
          ],
          bass: [
            'C3', null, 'C3', null, 'A2', null, 'A2', null,
            'F2', null, 'F2', null, 'G2', null, 'G2', null,
            'C3', null, 'C3', null, 'A2', null, 'A2', null,
            'F2', null, 'F2', null, 'G2', null, 'G2', null
          ],
          drums: [
            true, false, true, false, true, false, true, false,
            true, false, true, false, true, false, true, false,
            true, false, true, false, true, false, true, false,
            true, false, true, false, true, false, true, true
          ]
        }
      },
      synthwave: {
        bpm: 110, velocity: 0.8,
        tracks: {
          melody: [
            ['C5','G4'], null, ['C5','G4'], null, ['D4','A4'], null, ['D4','A4'], null,
            ['E4','B4'], null, ['E4','B4'], null, ['C5','G4'], null, ['D4','A4'], null,
            ['C5','G4'], null, ['C5','G4'], null, ['D4','A4'], null, ['D4','A4'], null,
            ['E4','B4'], null, ['G4','E4'], null, ['C5','E4'], null, ['C5','G4'], null
          ],
          bass: [
            'A2', 'A2', 'A2', 'A2', 'F2', 'F2', 'F2', 'F2',
            'G2', 'G2', 'G2', 'G2', 'C3', 'C3', 'C3', 'C3',
            'A2', 'A2', 'A2', 'A2', 'F2', 'F2', 'F2', 'F2',
            'G2', 'G2', 'G2', 'G2', 'C3', 'C3', 'C3', 'C3'
          ],
          drums: [
            true, false, true, false, true, false, true, false,
            true, false, true, false, true, false, true, false,
            true, false, true, false, true, false, true, false,
            true, false, true, false, true, false, true, false
          ]
        }
      },
      lofi: {
        bpm: 85, velocity: 0.75,
        tracks: {
          melody: [
            ['C5','E4','G4'], null, null, null, ['A4','C4','E4'], null, null, null,
            ['F4','A4','C4'], null, null, null, ['G4','B4','D4'], null, null, null,
            ['C5','E4','G4'], null, null, null, ['A4','C4','E4'], null, null, null,
            ['F4','A4','C4'], null, null, null, ['G4','B4','D4'], null, null, null
          ],
          bass: [
            'C3', null, null, null, 'A2', null, null, null,
            'F2', null, null, null, 'G2', null, null, null,
            'C3', null, null, null, 'A2', null, null, null,
            'F2', null, null, null, 'G2', null, null, null
          ],
          drums: [
            true, false, false, true, false, false, true, false,
            false, true, false, false, true, false, false, true,
            true, false, false, true, false, false, true, false,
            false, true, false, false, true, false, true, false
          ]
        }
      }
    };
    const p = PRESETS[key];
    if (!p) return;
    this.bpm = p.bpm;
    this.velocity = p.velocity;
    this.tracks = this.normalizeTracks(p.tracks);
    const bIn = document.getElementById('cmp-bpm');
    if (bIn) bIn.value = this.bpm;
    const vIn = document.getElementById('cmp-vel');
    if (vIn) vIn.value = this.velocity;
    this.buildRoll();
    if (this.buildMixerUI) this.buildMixerUI();
    this.updateDuration();
  },

  updateDuration() {
    const el = document.getElementById('cmp-dur');
    if (el) el.textContent = `⏱ ${(this.steps * this.stepDur()).toFixed(1)}s`;
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

  /* backward-compat: old format stores string|null per step; drums was a single boolean array */
  normalizeTracks(tr) {
    const fix = arr => (arr || []).map(v => Array.isArray(v) ? v : v);
    let d = tr.drums || [];
    if (Array.isArray(d)) {
      const kick = new Array(this.steps).fill(false);
      const snare = new Array(this.steps).fill(false);
      const hat = new Array(this.steps).fill(false);
      for(let s=0; s<Math.min(this.steps, d.length); s++) {
        if (d[s]) {
          if (s % 8 === 0) kick[s] = true;
          else if (s % 4 === 2) snare[s] = true;
          else hat[s] = true;
        }
      }
      d = { kick, snare, hat };
    }
    const mix = tr.mixer || { melody: { vol: 1, pan: 0 }, bass: { vol: 1, pan: 0 }, drums: { vol: 1, pan: 0 } };
    return { melody: fix(tr.melody), drums: d, bass: fix(tr.bass), mixer: mix, velocity: tr.velocity };
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
    const mkCell = (cls, on, cb, s, text='') => {
      const c = document.createElement('button');
      // group by 4 steps (1 beat) for FL Studio aesthetic
      const groupCls = Math.floor(s / 4) % 2 === 0 ? 'g1' : 'g2';
      c.className = `roll-cell ${cls} ${groupCls} ${on ? 'on' : ''}`;
      if (text) c.textContent = text;
      c.onclick = cb;
      return c;
    };
    // melody rows — chords: each row toggles independently
    notes.forEach(n => {
      const cells = this.tracks.melody.map((v, s) =>
        mkCell('mel', this.stepHas(v, n), () => this.toggleNote('melody', s, n, 'piano', 0.3), s));
      mkRow(n, cells);
    });
    // drums rows (Channel Rack style)
    const drumDefs = window.TONORA_INSTRUMENTS.find(i => i.id === 'drums');
    const mkDrumRow = (key, icon, sound) => {
      const dcells = this.tracks.drums[key].map((v, s) =>
        mkCell('drm', v, () => {
          this.tracks.drums[key][s] = !this.tracks.drums[key][s];
          this.buildRoll();
          if (this.tracks.drums[key][s]) window.TonoraAudio.playDrum(drumDefs, sound, 0.9);
        }, s, icon));
      mkRow(key.toUpperCase(), dcells);
    };
    mkDrumRow('kick', '🥁', 'kick');
    mkDrumRow('snare', '💥', 'snare');
    mkDrumRow('hat', '🪘', 'hat');
    // bass rows
    bassNotes.forEach(n => {
      const cells = this.tracks.bass.map((v, s) =>
        mkCell('bass', this.stepHas(v, n), () => this.toggleNote('bass', s, n, 'synth', 0.3), s));
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
    const playBtn = document.getElementById('cmp-play');
    if (playBtn) { playBtn.classList.add('primary'); playBtn.textContent = '⏸'; }
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
      
      let dur = this.stepDur();
      if (this.swing) dur *= (s % 2 === 0) ? 1.33 : 0.67;
      
      this.step = (this.step + 1) % this.steps;
      this.timer = setTimeout(tick, dur * 1000);
    };
    tick();
  },

  playStep(s) {
    const vel = this.velocity;
    const mix = this.tracks.mixer || { melody: {vol:1,pan:0}, bass: {vol:1,pan:0}, drums: {vol:1,pan:0} };
    if (!this.muted || !this.muted.melody) {
      const m = this.tracks.melody[s];
      if (m) (Array.isArray(m) ? m : [m]).forEach(n =>
        window.TonoraAudio.playNote(this.inst('piano'), n, this.stepDur() * 2, vel, 0, mix.melody));
    }
    if (!this.muted || !this.muted.bass) {
      const b = this.tracks.bass[s];
      if (b) (Array.isArray(b) ? b : [b]).forEach(n =>
        window.TonoraAudio.playNote(this.inst('synth'), n, this.stepDur() * 3, vel, 0, mix.bass));
    }
    if (!this.muted || !this.muted.drums) {
      const d = this.inst('drums');
      // back-compat
      if (this.tracks.drums[s] === true) {
        window.TonoraAudio.playDrum(d, s % 8 === 0 ? 'kick' : (s % 4 === 2 ? 'snare' : 'hat'), vel, 0, mix.drums);
      } else if (typeof this.tracks.drums === 'object' && !Array.isArray(this.tracks.drums)) {
        if (this.tracks.drums.kick && this.tracks.drums.kick[s]) window.TonoraAudio.playDrum(d, 'kick', vel, 0, mix.drums);
        if (this.tracks.drums.snare && this.tracks.drums.snare[s]) window.TonoraAudio.playDrum(d, 'snare', vel, 0, mix.drums);
        if (this.tracks.drums.hat && this.tracks.drums.hat[s]) window.TonoraAudio.playDrum(d, 'hat', vel, 0, mix.drums);
      }
    }
  },

  stop() {
    this.playing = false;
    clearTimeout(this.timer);
    const playBtn = document.getElementById('cmp-play');
    if (playBtn) { playBtn.classList.remove('primary'); playBtn.textContent = '▶'; }
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
      const blob = await window.renderCompositionToWav(this.tracks, this.bpm, this.steps, this.swing);
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
          if (this.buildMixerUI) this.buildMixerUI();
          this.updateDuration();
        }
      } catch (e) { alert('Invalid file'); }
    };
    r.readAsText(file);
  },

  leave() { this.stop(); this.save(); }
};
