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
  history: [],
  redoStack: [],

  /* ---- undo / redo ---- */
  snapshot() {
    this.history.push(JSON.stringify({ tracks: this.tracks, steps: this.steps, bpm: this.bpm, velocity: this.velocity }));
    if (this.history.length > 60) this.history.shift();
    this.redoStack.length = 0;
  },
  _state() {
    return JSON.stringify({ tracks: this.tracks, steps: this.steps, bpm: this.bpm, velocity: this.velocity });
  },
  undo() {
    if (!this.history.length) return;
    this.redoStack.push(this._state());
    this._restore(JSON.parse(this.history.pop()));
  },
  redo() {
    if (!this.redoStack.length) return;
    this.history.push(this._state());
    this._restore(JSON.parse(this.redoStack.pop()));
  },
  _restore(s) {
    this.tracks = s.tracks;
    this.steps = s.steps;
    this.bpm = s.bpm;
    this.velocity = s.velocity;
    const lenSel = document.getElementById('cmp-len'); if (lenSel) lenSel.value = this.steps;
    const bpmIn = document.getElementById('cmp-bpm'); if (bpmIn) bpmIn.value = this.bpm;
    const velIn = document.getElementById('cmp-vel'); if (velIn) velIn.value = this.velocity;
    this.buildRoll();
    if (this.buildMixerUI) this.buildMixerUI();
    this.updateDuration();
  },

  enter(root) {
    this.tracks = this.normalizeTracks({ melody: new Array(this.steps).fill(null), bass: new Array(this.steps).fill(null), drums: new Array(this.steps).fill(false), velocity: this.velocity });
    this.muted = { melody: false, drums: false, bass: false };
    this.solo = { melody: false, drums: false, bass: false };
    this.loadSaved();
    root.innerHTML = `
      <div class="compose-hud">
        <button class="btn" id="cmp-play">▶</button>
        <button class="btn" id="cmp-stop">■</button>
        <button class="btn" id="cmp-undo" title="Undo (Ctrl+Z)">↶</button>
        <button class="btn" id="cmp-redo" title="Redo (Ctrl+Y)">↷</button>
        <label>${t('tempo')}: <input type="number" id="cmp-bpm" min="40" max="240" value="${this.bpm}" style="width:5em"></label>
        <span class="cmp-dur" id="cmp-dur" title="${t('duration')}"></span>
        <select class="btn" id="cmp-len" style="font-size:0.8rem; padding:0.35rem 0.5rem">
          <option value="16">16 Steps (1 Bar)</option>
          <option value="32">32 Steps (2 Bars)</option>
          <option value="64">64 Steps (4 Bars)</option>
        </select>
        <button class="btn" id="cmp-more-btn" title="${t('more')}" aria-expanded="false">⋯</button>
        <div id="cmp-more">
        <label>${t('velocity')}: <input type="range" id="cmp-vel" min="0.4" max="1" step="0.05" value="${this.velocity}" style="width:7em"></label>
        <select class="btn" id="cmp-presets" style="font-size:0.8rem; padding:0.35rem 0.5rem">
          <option value="">✨ ${t('presets')}</option>
          <optgroup label="Song Templates">
            <option value="pop">Pop Groove</option>
            <option value="synthwave">Synthwave</option>
            <option value="lofi">Lofi Chill</option>
          </optgroup>
          <optgroup label="Drum Patterns">
            <option value="drums-rock">Rock Beat</option>
            <option value="drums-hiphop">Hip-Hop</option>
            <option value="drums-house">Four on the Floor</option>
            <option value="drums-6-8">Persian 6/8</option>
            <option value="drums-rap">Rap / Trap</option>
          </optgroup>
        </select>
        <button class="btn" id="cmp-dup" title="${t('duplicate')}">⧉</button>
        <select class="btn" id="cmp-transpose" title="Transpose" style="font-size:0.8rem; padding:0.35rem 0.5rem; width:auto">
          <option value="">♯♭</option>
          <option value="-12">-12</option><option value="-7">-7</option><option value="-5">-5</option>
          <option value="-4">-4</option><option value="-3">-3</option><option value="-2">-2</option>
          <option value="-1">-1</option><option value="1">+1</option><option value="2">+2</option>
          <option value="3">+3</option><option value="4">+4</option><option value="5">+5</option>
          <option value="7">+7</option><option value="12">+12</option>
        </select>
        <select class="btn" id="cmp-groove" title="Groove presets" style="font-size:0.8rem; padding:0.35rem 0.5rem">
          <option value="">🕺 Groove</option>
          <option value="straight">Straight</option>
          <option value="shuffle">Shuffle</option>
          <option value="deep-swing">Deep Swing</option>
          <option value="loose">Loose / Human</option>
          <option value="tight">Tight / Machine</option>
        </select>
        <button class="btn toggle" id="cmp-swing" title="Swing Rhythm">🎵 Swing</button>
        <button class="btn toggle" id="cmp-countin" title="Count-in before recording">🥁 ${t('countIn')}</button>
        <button class="btn toggle" id="cmp-metro" title="Metronome while playing">🎚️ ${t('metro')}</button>
        <label title="Humanize (timing variation)">🤹 <input type="range" id="cmp-human" min="0" max="60" step="5" value="${this.humanize || 0}" style="width:6em"></label>
        <button class="btn toggle" id="cmp-vellane" title="Velocity lane">📊 VEL</button>
        <button class="btn toggle" id="cmp-prview" title="Piano-roll view">🎼 Roll</button>
        <button class="btn" id="cmp-mixer-btn">🎚️ Mixer</button>
        <button class="btn toggle" id="mute-mel" title="Mute melody">🎹 ${t('melody')}</button>
        <button class="btn toggle" id="mute-drm" title="Mute drums">🥁 ${t('drums')}</button>
        <button class="btn toggle" id="mute-bass" title="Mute bass">🌈 ${t('bass')}</button>
        <button class="btn" id="cmp-save">${t('save')}</button>
        <button class="btn" id="cmp-export">${t('export')}</button>
        <button class="btn" id="cmp-share" title="${t('share')}">🔗</button>
        <button class="btn" id="cmp-wav">${t('exportWav')}</button>
        <button class="btn" id="cmp-midi">${t('exportMidi')}</button>
        <button class="btn primary" id="cmp-practice" title="${t('practiceInLearn')}">🎓 ${t('practice')}</button>
        <label class="btn file-btn">${t('import')}<input type="file" id="cmp-import" accept=".json" hidden></label>
        <label class="btn file-btn">🎼 ${t('importMidi')}<input type="file" id="cmp-import-midi" accept=".mid,.midi,audio/midi" hidden></label>
        <select class="btn" id="cmp-projects" title="${t('projects')}" style="font-size:0.8rem; padding:0.35rem 0.5rem">
          <option value="">📁 ${t('projects')}</option>
        </select>
        <button class="btn" id="cmp-saveas" title="${t('saveAs')}">＋</button>
        <button class="btn danger" id="cmp-delproj" title="${t('delete')}">🗑</button>
        <button class="btn" id="cmp-chain" title="Pattern chain">🔗⛓</button>
        <button class="btn danger" id="cmp-clear">${t('clear')}</button>
        </div>
      </div>
      <div id="cmp-mixer-panel" class="hidden" style="background:var(--bg2); padding:1rem; border-radius:0.5rem; margin-bottom:1rem; display:flex; gap:1.5rem; border:1px solid rgba(255,255,255,0.1)">
      </div>
      <div id="cmp-chain-panel" class="hidden" style="background:var(--bg2); padding:1rem; border-radius:0.5rem; margin-bottom:1rem; border:1px solid rgba(255,255,255,0.1)">
        <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-bottom:0.5rem">
          <strong>⛓ Chain</strong>
          <button class="btn" id="chain-add" title="Snapshot current pattern as a section">＋ Add section</button>
          <button class="btn toggle" id="chain-mode" title="Play sections in order">▶ Chain: off</button>
          <button class="btn danger" id="chain-clear">Clear</button>
        </div>
        <div id="chain-list" style="display:flex; gap:0.5rem; flex-wrap:wrap"></div>
      </div>
      <div class="roll-wrap" id="roll"></div>
    `;
    root.querySelector('#cmp-play').onclick = () => this.togglePlay();
    root.querySelector('#cmp-stop').onclick = () => this.stop();
    root.querySelector('#cmp-undo').onclick = () => this.undo();
    root.querySelector('#cmp-redo').onclick = () => this.redo();
    const moreBtn = root.querySelector('#cmp-more-btn');
    const moreBox = root.querySelector('#cmp-more');
    if (moreBtn && moreBox) {
      moreBtn.onclick = () => {
        const open = moreBox.classList.toggle('open');
        moreBtn.setAttribute('aria-expanded', String(open));
        moreBtn.classList.toggle('active', open);
      };
    }
    if (this._onKey) document.removeEventListener('keydown', this._onKey);
    this._prSelected = new Set();
    this._onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!(e.ctrlKey || e.metaKey)) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.pianoRollView && this._prSelected && this._prSelected.size) {
          e.preventDefault();
          this._prDeleteSelected();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
      else if (k === 'c' && this.pianoRollView) {
        if (this._prCopySelected()) {
          e.preventDefault();
          const b = document.getElementById('cmp-prview');
          if (b) { const t = b.textContent; b.textContent = '✓'; setTimeout(() => { if (b.isConnected) b.textContent = t; }, 800); }
        }
      }
      else if (k === 'v' && this.pianoRollView) {
        e.preventDefault();
        // paste after the rightmost selected/pasted section if known, else at the playhead
        const sel = this._prSelected && this._prSelected.size
          ? Math.max(...[...this._prSelected].map(k => +k.split(':')[2])) + 1
          : Math.min(this.steps - 1, this.step + 1);
        this._prPaste(sel);
      }
    };
    document.addEventListener('keydown', this._onKey);
    root.querySelector('#cmp-bpm').onchange = e => {
      this.bpm = Math.max(40, Math.min(240, +e.target.value || 120));
      e.target.value = this.bpm;
      this.updateDuration();
    };
    const lenSelect = root.querySelector('#cmp-len');
    lenSelect.value = this.steps;
    lenSelect.onchange = e => {
      const newLen = parseInt(e.target.value);
      if (newLen !== this.steps) {
        this.snapshot();
        this.steps = newLen;
        this.resizeTracks();
        this.buildRoll();
        this.updateDuration();
      }
    };
    root.querySelector('#cmp-vel').oninput = e => { this.velocity = +e.target.value; this.tracks.velocity = this.velocity; };
    const swingBtn = root.querySelector('#cmp-swing');
    if (this.swing) swingBtn.classList.add('active');
    swingBtn.onclick = () => {
      this.swing = !this.swing;
      swingBtn.classList.toggle('active', this.swing);
    };
    const countinBtn = root.querySelector('#cmp-countin');
    if (this.countIn) countinBtn.classList.add('active');
    countinBtn.onclick = () => {
      this.countIn = !this.countIn;
      countinBtn.classList.toggle('active', this.countIn);
    };
    const metroBtn = root.querySelector('#cmp-metro');
    if (this.metronome) metroBtn.classList.add('active');
    metroBtn.onclick = () => {
      this.metronome = !this.metronome;
      metroBtn.classList.toggle('active', this.metronome);
    };
    const humanSlider = root.querySelector('#cmp-human');
    if (humanSlider) {
      humanSlider.value = this.humanize || 0;
      humanSlider.oninput = e => this.setHumanize(+e.target.value);
    }
    const velBtn = root.querySelector('#cmp-vellane');
    if (this.showVelLane) velBtn.classList.add('active');
    velBtn.onclick = () => {
      this.showVelLane = !this.showVelLane;
      velBtn.classList.toggle('active', this.showVelLane);
      this.buildRoll();
    };
    const grooveSel = root.querySelector('#cmp-groove');
    if (grooveSel) grooveSel.onchange = e => { if (e.target.value) { this.applyGroove(e.target.value); e.target.value = ''; } };
    const prBtn = root.querySelector('#cmp-prview');
    if (this.pianoRollView) prBtn.classList.add('active');
    prBtn.onclick = () => {
      this.stop();
      this.pianoRollView = !this.pianoRollView;
      prBtn.classList.toggle('active', this.pianoRollView);
      this.buildRoll();
    };
    root.querySelector('#cmp-presets').onchange = e => {
      if (e.target.value) { this.loadPreset(e.target.value); e.target.value = ''; }
    };
    root.querySelector('#cmp-dup').onclick = () => this.duplicatePattern();
    const transSel = root.querySelector('#cmp-transpose');
    if (transSel) transSel.onchange = e => {
      if (e.target.value !== '') { this.transposeBy(+e.target.value); e.target.value = ''; }
    };
    const wireMute = (id, key) => {
      const b = root.querySelector('#' + id);
      b.onclick = () => {
        this.muted[key] = !this.muted[key];
        b.classList.toggle('active', !this.muted[key]);
        b.style.opacity = this.muted[key] ? '0.45' : '1';
        this._reschedule();
      };
      b.classList.add('active');
    };
    wireMute('mute-mel', 'melody');
    wireMute('mute-drm', 'drums');
    wireMute('mute-bass', 'bass');
    root.querySelector('#cmp-save').onclick = () => this.save();
    root.querySelector('#cmp-export').onclick = () => this.exportSong();
    root.querySelector('#cmp-share').onclick = () => this.shareSong();
    // chain panel wiring
    if (!Array.isArray(this.sections)) this.sections = [];
    if (this.chainMode === undefined) this.chainMode = false;
    const chainPanel = root.querySelector('#cmp-chain-panel');
    const chainAdd = root.querySelector('#chain-add');
    const chainModeBtn = root.querySelector('#chain-mode');
    const chainClear = root.querySelector('#chain-clear');
    if (chainAdd) chainAdd.onclick = () => this.addSection();
    if (chainModeBtn) {
      chainModeBtn.textContent = this.chainMode ? '▶ Chain: on' : '▶ Chain: off';
      chainModeBtn.classList.toggle('active', this.chainMode);
      chainModeBtn.onclick = () => {
        this.chainMode = !this.chainMode;
        chainModeBtn.textContent = this.chainMode ? '▶ Chain: on' : '▶ Chain: off';
        chainModeBtn.classList.toggle('active', this.chainMode);
      };
    }
    if (chainClear) chainClear.onclick = () => { this.snapshot(); this.sections = []; this.renderChainList(); };
    this.renderChainList();
    root.querySelector('#cmp-wav').onclick = () => this.exportWav();
    root.querySelector('#cmp-midi').onclick = () => this.exportMidi();
    root.querySelector('#cmp-practice').onclick = () => this.practiceInLearn();
    root.querySelector('#cmp-import').onchange = e => this.importSong(e.target.files[0]);
    root.querySelector('#cmp-import-midi').onchange = e => { this.importMidi(e.target.files[0]); e.target.value = ''; };
    const projSel = root.querySelector('#cmp-projects');
    projSel.onchange = e => { if (e.target.value) this.loadProject(e.target.value); };
    root.querySelector('#cmp-saveas').onclick = () => {
      const name = prompt(t('projectName'), 'Song ' + (Object.keys(this.projectList()).length + 1));
      if (name) this.saveProject(name);
    };
    root.querySelector('#cmp-chain').onclick = () => this.toggleChainPanel();
    root.querySelector('#cmp-delproj').onclick = () => {
      if (projSel.value && confirm(t('confirmDelete'))) this.deleteProject(projSel.value);
    };
    root.querySelector('#cmp-clear').onclick = () => {
      if (confirm(t('confirmClear'))) {
        this.snapshot();
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
      if (!this.tracks.mixer) this.tracks.mixer = { melody: {vol:1,pan:0}, bass: {vol:1,pan:0}, drums: {vol:1,pan:0} };
      mixerPanel.innerHTML = '';
      const meters = {};
      const mkStrip = (id, name, icon) => {
        const mix = this.tracks.mixer[id] || (this.tracks.mixer[id] = { vol: 1, pan: 0 });
        const el = document.createElement('div');
        el.style.cssText = 'display:flex; flex-direction:column; gap:0.5rem; align-items:center;';
        el.innerHTML = `
          <strong>${icon} ${name}</strong>
          <div class="meter" style="width:60px; height:8px; background:rgba(255,255,255,0.12); border-radius:4px; overflow:hidden">
            <div class="${id}-meter" style="height:100%; width:0%; background:linear-gradient(90deg,#2ecc71,#f1c40f,#e74c3c); transition:width 60ms linear"></div>
          </div>
          <label style="font-size:0.75rem; color:var(--muted)">Vol: <input type="range" class="${id}-vol" min="0" max="2" step="0.1" value="${mix.vol}" style="width:50px"></label>
          <label style="font-size:0.75rem; color:var(--muted)">Pan: <input type="range" class="${id}-pan" min="-1" max="1" step="0.1" value="${mix.pan}" style="width:50px"></label>
          <button class="btn toggle ${id}-solo" style="font-size:0.7rem; padding:0.25rem 0.5rem">🎯 ${t('solo')}</button>
        `;
        el.querySelector(`.${id}-vol`).oninput = e => {
          this.tracks.mixer[id].vol = +e.target.value;
          window.TonoraAudio.setBusGain(id, this.tracks.mixer[id].vol);
        };
        el.querySelector(`.${id}-pan`).oninput = e => {
          this.tracks.mixer[id].pan = +e.target.value;
          window.TonoraAudio.setBusPan(id, this.tracks.mixer[id].pan);
        };
        const soloBtn = el.querySelector(`.${id}-solo`);
        soloBtn.classList.toggle('active', this.solo[id]);
        soloBtn.onclick = () => {
          this.solo[id] = !this.solo[id];
          soloBtn.classList.toggle('active', this.solo[id]);
          this._reschedule();
        };
        meters[id] = el.querySelector(`.${id}-meter`);
        // push saved mixer values onto the live buses
        window.TonoraAudio.setBusGain(id, mix.vol);
        window.TonoraAudio.setBusPan(id, mix.pan);
        mixerPanel.appendChild(el);
      };
      mkStrip('melody', t('melody'), '🎹');
      mkStrip('drums', t('drums'), '🥁');
      mkStrip('bass', t('bass'), '🌈');

      // live level meters
      cancelAnimationFrame(this._meterRaf);
      const loopMeters = () => {
        this._meterRaf = requestAnimationFrame(loopMeters);
        for (const id in meters) {
          if (meters[id]) meters[id].style.width = Math.round(window.TonoraAudio.getBusLevel(id) * 100) + '%';
        }
      };
      loopMeters();
    };
    buildMixerUI();
    this.buildMixerUI = buildMixerUI;

    this.buildRoll();
    this.updateDuration();
    this.refreshProjects();
  },

  /* ---- project slots (IndexedDB via TonoraStore, localStorage fallback) ---- */
  projectList() {
    // sync read of the localStorage mirror (kept in sync by refreshProjects)
    try { return JSON.parse(localStorage.getItem('tonora-projects-mirror')) || {}; }
    catch (e) { return {}; }
  },

  async refreshProjects(selected) {
    const sel = document.getElementById('cmp-projects');
    if (!sel) return;
    let names = [];
    if (window.TonoraStore) {
      try {
        await window.TonoraStore.migrate();
        names = await window.TonoraStore.list();
        // mirror for sync reads elsewhere
        const all = await window.TonoraStore.all();
        localStorage.setItem('tonora-projects-mirror', JSON.stringify(all));
      } catch (e) {
        names = Object.keys(this.projectList());
      }
    } else {
      names = Object.keys(this.projectList());
    }
    const all = this.projectList();
    sel.innerHTML = `<option value="">📁 ${t('projects')}</option>` +
      names.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
    if (selected && (all[selected] || names.includes(selected))) sel.value = selected;
  },

  async saveProject(name) {
    this.tracks.velocity = this.velocity;
    const data = { bpm: this.bpm, steps: this.steps, tracks: this.tracks, sections: this.sections || [], savedAt: Date.now() };
    if (window.TonoraStore) await window.TonoraStore.set(name, data);
    else {
      const all = this.projectList();
      all[name] = data;
      localStorage.setItem('tonora-projects-mirror', JSON.stringify(all));
    }
    this.refreshProjects(name);
    const b = document.getElementById('cmp-saveas');
    if (b) { b.textContent = '✓'; setTimeout(() => { b.textContent = '＋'; }, 1200); }
    TonoraAchievements.unlock('composer');
  },

  async loadProject(name) {
    let d = null;
    if (window.TonoraStore) d = await window.TonoraStore.get(name);
    else d = this.projectList()[name];
    if (!d) return;
    this.snapshot();
    this.steps = d.steps || 32;
    this.bpm = d.bpm || 120;
    this.tracks = this.normalizeTracks(d.tracks);
    this.sections = Array.isArray(d.sections) ? d.sections : [];
    this.renderChainList();
    if (d.tracks.velocity !== undefined) this.velocity = d.tracks.velocity;
    const lenSel = document.getElementById('cmp-len');
    if (lenSel) lenSel.value = this.steps;
    const bpmIn = document.getElementById('cmp-bpm');
    if (bpmIn) bpmIn.value = this.bpm;
    const velIn = document.getElementById('cmp-vel');
    if (velIn) velIn.value = this.velocity;
    this.buildRoll();
    if (this.buildMixerUI) this.buildMixerUI();
    this.updateDuration();
  },

  async deleteProject(name) {
    if (window.TonoraStore) await window.TonoraStore.del(name);
    else {
      const all = this.projectList();
      delete all[name];
      localStorage.setItem('tonora-projects-mirror', JSON.stringify(all));
    }
    this.refreshProjects();
  },

  /* legacy: keep old test-hook access to projects via localStorage mirror */
  legacyProjectList() {
    try { return JSON.parse(localStorage.getItem('tonora-projects')) || {}; }
    catch (e) { return {}; }
  },

  importMidi(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const res = window.midiToTracks(new Uint8Array(r.result), this.steps);
        this.snapshot();
        this.bpm = res.bpm || this.bpm;
        this.tracks = this.normalizeTracks(res.tracks);
        const bpmIn = document.getElementById('cmp-bpm');
        if (bpmIn) bpmIn.value = this.bpm;
        this.buildRoll();
        if (this.buildMixerUI) this.buildMixerUI();
        this.updateDuration();
      } catch (e) { alert('Invalid MIDI file'); }
    };
    r.readAsArrayBuffer(file);
  },

  /* duplicate the first half of the pattern into the second half (16→32, 32→64) */
  duplicatePattern() {
    if (this.steps >= 64) { alert('Pattern is already 64 steps'); return; }
    const newSteps = this.steps * 2;
    this.snapshot();
    const ext = (arr, def) => {
      const out = new Array(newSteps).fill(def);
      for (let s = 0; s < newSteps; s++) out[s] = arr && arr[s % this.steps] !== undefined ? arr[s % this.steps] : def;
      return out;
    };
    this.tracks.melody = ext(this.tracks.melody, null);
    this.tracks.bass = ext(this.tracks.bass, null);
    if (this.tracks.drums && !Array.isArray(this.tracks.drums)) {
      this.tracks.drums.kick = ext(this.tracks.drums.kick, false);
      this.tracks.drums.snare = ext(this.tracks.drums.snare, false);
      this.tracks.drums.hat = ext(this.tracks.drums.hat, false);
    }
    this.steps = newSteps;
    const lenSel = document.getElementById('cmp-len');
    if (lenSel) lenSel.value = this.steps;
    this.buildRoll();
    this.updateDuration();
  },

  /* clear one track only (used by per-row clear buttons) */
  clearTrack(track, drumKey) {
    this.snapshot();
    if (track === 'drums' && drumKey) {
      this.tracks.drums[drumKey] = new Array(this.steps).fill(false);
    } else {
      this.tracks[track] = new Array(this.steps).fill(track === 'drums' ? false : null);
    }
    this.buildRoll();
  },

  loadPreset(key) {
    const DRUM_PRESETS = {
      'drums-rock': {
        drums: {
          kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
          snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
          hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1]
        }
      },
      'drums-hiphop': {
        drums: {
          kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
          snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
          hat:   [1,1,0,1, 1,0,1,1, 0,1,1,0, 1,1,0,1]
        }
      },
      'drums-house': {
        drums: {
          kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
          snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
          hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0]
        }
      },
      'drums-6-8': {
        drums: {
          kick:  [1,0,0, 1,0,0, 1,0,0, 1,0,0, 1,0,0,0],
          snare: [0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1,0],
          hat:   [1,0,1, 1,0,1, 1,0,1, 1,0,1, 1,0,1,0]
        }
      },
      'drums-rap': {
        drums: {
          kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
          snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
          hat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]
        }
      }
    };
    if (DRUM_PRESETS[key]) {
      this.snapshot();
      const src = DRUM_PRESETS[key].drums;
      const fit = arr => {
        const out = new Array(this.steps).fill(false);
        for (let s = 0; s < this.steps; s++) out[s] = !!(arr && arr[s % arr.length]);
        return out;
      };
      this.tracks.drums = { kick: fit(src.kick), snare: fit(src.snare), hat: fit(src.hat) };
      this.buildRoll();
      return;
    }
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
    this.snapshot();
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
        if (d.steps) this.steps = d.steps;
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
    const stepVel = new Array(this.steps).fill(0);
    if (Array.isArray(tr.stepVel)) {
      for (let s = 0; s < Math.min(this.steps, tr.stepVel.length); s++) stepVel[s] = tr.stepVel[s] || 0;
    }
    const noteLen = {
      melody: new Array(this.steps).fill(2),
      bass: new Array(this.steps).fill(2)
    };
    if (tr.noteLen && typeof tr.noteLen === 'object') {
      for (const key of ['melody', 'bass']) {
        if (Array.isArray(tr.noteLen[key])) {
          for (let s = 0; s < Math.min(this.steps, tr.noteLen[key].length); s++) {
            const v = tr.noteLen[key][s];
            if (v > 0) noteLen[key][s] = Math.min(8, v);
          }
        }
      }
    }
    return { melody: fix(tr.melody), drums: d, bass: fix(tr.bass), mixer: mix, velocity: tr.velocity, stepVel, noteLen };
  },

  resizeTracks() {
    const r = (arr, def) => {
      if (arr.length > this.steps) return arr.slice(0, this.steps);
      return [...arr, ...new Array(this.steps - arr.length).fill(def)];
    };
    this.tracks.melody = r(this.tracks.melody || [], null);
    this.tracks.bass = r(this.tracks.bass || [], null);
    if (this.tracks.drums && typeof this.tracks.drums === 'object' && !Array.isArray(this.tracks.drums)) {
      this.tracks.drums.kick = r(this.tracks.drums.kick || [], false);
      this.tracks.drums.snare = r(this.tracks.drums.snare || [], false);
      this.tracks.drums.hat = r(this.tracks.drums.hat || [], false);
    }
    this.tracks.stepVel = r(this.tracks.stepVel || [], 0);
    // parallel note-length lane (1–8 sixteenths), default 2
    const rl = (arr) => {
      const a = Array.isArray(arr) ? arr : [];
      if (a.length > this.steps) return a.slice(0, this.steps);
      return [...a, ...new Array(this.steps - a.length).fill(2)];
    };
    this.tracks.noteLen = this.tracks.noteLen || {};
    this.tracks.noteLen.melody = rl((this.tracks.noteLen || {}).melody);
    this.tracks.noteLen.bass = rl((this.tracks.noteLen || {}).bass);
  },

  buildRoll() {
    if (this.pianoRollView) { this.buildPianoRoll(); return; }
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
      c.onclick = () => cb(c);
      return c;
    };
    // melody rows — chords: each row toggles independently
    notes.forEach(n => {
      const cells = this.tracks.melody.map((v, s) =>
        mkCell('mel', this.stepHas(v, n), (cell) => this.toggleNote('melody', s, n, 'piano', 0.3, cell), s));
      mkRow(n, cells);
    });
    // drums rows (Channel Rack style)
    const drumDefs = window.TONORA_INSTRUMENTS.find(i => i.id === 'drums');
    const mkDrumRow = (key, icon, sound) => {
      const dcells = this.tracks.drums[key].map((v, s) =>
        mkCell('drm', v, (cell) => {
          this.snapshot();
          this.tracks.drums[key][s] = !this.tracks.drums[key][s];
          cell.classList.toggle('on', this.tracks.drums[key][s]);
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
        mkCell('bass', this.stepHas(v, n), (cell) => this.toggleNote('bass', s, n, 'synth', 0.3, cell), s));
      mkRow(n, cells);
    });
    // velocity lane — per-step accent (click cycles 0 → 0.5 → 0.7 → 0.85 → 1.0)
    if (this.showVelLane) {
      const steps_ = [0, 0.5, 0.7, 0.85, 1.0];
      const vCells = (this.tracks.stepVel || []).map((v, s) => {
        const c = document.createElement('button');
        const groupCls = Math.floor(s / 4) % 2 === 0 ? 'g1' : 'g2';
        c.className = `roll-cell vel ${groupCls} ${v > 0 ? 'on' : ''}`;
        c.dataset.vel = v;
        c.title = `${t('velocity')}: ${v || '-'}`;
        const bar = document.createElement('span');
        bar.className = 'vel-bar';
        bar.style.height = v > 0 ? Math.round(v * 100) + '%' : '4%';
        c.appendChild(bar);
        c.onclick = () => {
          this.snapshot();
          const idx = steps_.indexOf(v);
          const nv = steps_[(idx + 1) % steps_.length];
          this.tracks.stepVel[s] = nv;
          c.dataset.vel = nv;
          c.title = `${t('velocity')}: ${nv || '-'}`;
          c.classList.toggle('on', nv > 0);
          bar.style.height = nv > 0 ? Math.round(nv * 100) + '%' : '4%';
        };
        return c;
      });
      mkRow('VEL', vCells);
    }
  },

  stepHas(v, n) {
    if (Array.isArray(v)) return v.includes(n) || v.some(x => x && typeof x === 'object' && x.n === n);
    if (v && typeof v === 'object') return v.n === n;
    return v === n;
  },

  /* normalize a cell to an array of {n, len} hit objects (len in steps) */
  _cellHits(cell, s, track) {
    const lenOf = (n) => {
      const arr = (this.tracks.noteLen && this.tracks.noteLen[track]) || [];
      const v = arr[s];
      return (v && v > 0) ? Math.min(8, v) : 2;
    };
    if (!cell) return [];
    if (typeof cell === 'string') return [{ n: cell, len: lenOf(cell) }];
    if (cell && typeof cell === 'object' && !Array.isArray(cell)) return [{ n: cell.n, len: lenOf(cell.n) }];
    if (Array.isArray(cell)) {
      return cell.map(x => (x && typeof x === 'object') ? { n: x.n, len: lenOf(x.n) } : { n: x, len: lenOf(x) }).filter(h => h.n);
    }
    return [];
  },

  /* chromatic piano-roll view (C3–B5): click = note, drag = stretch, right-click = erase */
  buildPianoRoll() {
    const roll = document.getElementById('roll');
    roll.innerHTML = '';
    const SEMIS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const rows = [];
    for (let oct = 5; oct >= 3; oct--) {
      SEMIS.slice().reverse().forEach(pc => { /* built below in order */ });
    }
    // build high→low
    const ordered = [];
    for (let oct = 5; oct >= 3; oct--) {
      for (let i = SEMIS.length - 1; i >= 0; i--) ordered.push(SEMIS[i] + oct);
    }
    const mkRow = (label, cells, isBlack) => {
      const row = document.createElement('div');
      row.className = 'roll-row pr-row' + (isBlack ? ' pr-black' : '');
      const lab = document.createElement('div');
      lab.className = 'roll-label pr-label';
      lab.textContent = label;
      row.appendChild(lab);
      cells.forEach((cell) => row.appendChild(cell));
      roll.appendChild(row);
    };
    const grid = document.createElement('div');
    grid.className = 'pr-grid';
    ordered.forEach(n => {
      const isBlack = n.includes('#');
      const cells = [];
      for (let s = 0; s < this.steps; s++) {
        const c = document.createElement('div');
        const groupCls = Math.floor(s / 4) % 2 === 0 ? 'g1' : 'g2';
        c.className = `pr-cell ${groupCls}${isBlack ? ' black' : ''}`;
        c.dataset.note = n;
        c.dataset.step = s;
        cells.push(c);
      }
      mkRow(n, cells, isBlack);
    });
    // overlay note blocks
    const hits = new Set();
    const place = (track, instId) => {
      for (let s = 0; s < this.steps; s++) {
        this._cellHits(this.tracks[track][s], s, track).forEach(h => {
          const key = track + ':' + h.n + ':' + s;
          if (hits.has(key)) return;
          hits.add(key);
          const el = document.createElement('div');
          el.className = `pr-note ${track}`;
          el.style.left = `calc(var(--pr-lab) + ${s} * var(--pr-cell))`;
          el.style.width = `calc(${Math.min(h.len, this.steps - s)} * var(--pr-cell) - 3px)`;
          el.textContent = h.n.replace(/-?\d+$/, '');
          el.title = `${h.n} · ${h.len} steps — drag right edge to stretch`;
          el.dataset.note = h.n;
          el.dataset.step = s;
          el.dataset.len = h.len;
          const rowsEl = roll.querySelectorAll('.pr-row');
          const rowIdx = ordered.indexOf(h.n);
          if (rowIdx >= 0 && rowsEl[rowIdx]) rowsEl[rowIdx].appendChild(el);
          this._wireNoteBlock(el, track, instId);
        });
      }
    };
    place('melody', 'piano');
    place('bass', 'synth');
    // interactions on empty cells: click adds, right-click erases step
    roll.querySelectorAll('.pr-cell').forEach(c => {
      c.addEventListener('pointerdown', (e) => {
        if (e.button === 2) {
          e.preventDefault();
          this._prErase(c.dataset.note, +c.dataset.step);
        } else {
          this._prAdd(c.dataset.note, +c.dataset.step);
        }
      });
    });
    roll.addEventListener('contextmenu', (e) => {
      if (e.target.closest && e.target.closest('.pr-grid, .roll-row')) e.preventDefault();
    });
  },

  _prAdd(n, s) {
    this.toggleNote('melody', s, n, 'piano', 0.3, null);
  },

  _prErase(n, s) {
    const arr = this.tracks.melody;
    const cell = arr[s];
    let changed = false;
    if (Array.isArray(cell)) {
      const i = cell.findIndex(x => (x && typeof x === 'object' ? x.n : x) === n);
      if (i >= 0) { this.snapshot(); cell.splice(i, 1); if (!cell.length) arr[s] = null; changed = true; }
    } else if ((cell && typeof cell === 'object' ? cell.n : cell) === n) {
      this.snapshot(); arr[s] = null; changed = true;
    }
    if (changed) this.buildPianoRoll();
  },

  _wireNoteBlock(el, track, instId) {
    // drag the right edge to stretch 1–8 steps; ctrl/shift-click = multi-select
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const key = track + ':' + el.dataset.note + ':' + el.dataset.step;
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        e.preventDefault();
        this._prToggleSelect(el, key);
        return;
      }
      if (e.button === 2) {
        e.preventDefault();
        if (this._prSelected && this._prSelected.has(key)) this._prDeleteSelected();
        else this._prEraseBlock(el);
        return;
      }
      const rect = el.getBoundingClientRect();
      const edge = rect.right - e.clientX < 14;
      drag = { edge, startX: e.clientX, startLen: +el.dataset.len || 2, s: +el.dataset.step, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const cellW = el.parentElement ? el.parentElement.clientWidth / Math.max(1, this.steps + 1) : 24;
      const dSteps = Math.round((e.clientX - drag.startX) / Math.max(8, cellW));
      if (dSteps !== 0) drag.moved = true;
      if (drag.edge && dSteps !== 0) {
        const nl = Math.max(1, Math.min(8, drag.startLen + dSteps));
        el.dataset.len = nl;
        el.style.width = `calc(${Math.min(nl, this.steps - drag.s)} * var(--pr-cell) - 3px)`;
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const nl = +el.dataset.len || 2;
      if (drag.edge && nl !== drag.startLen) {
        this.snapshot();
        this.tracks.noteLen = this.tracks.noteLen || {};
        this.tracks.noteLen[track] = this.tracks.noteLen[track] || new Array(this.steps).fill(2);
        this.tracks.noteLen[track][drag.s] = nl;
      } else if (!drag.moved) {
        // plain click on the block → preview + erase (toggle off)
        this._prEraseBlock(el);
      }
      drag = null;
    });
  },

  _prEraseBlock(el) {
    const n = el.dataset.note, s = +el.dataset.step;
    const arr = this.tracks[el.classList.contains('bass') ? 'bass' : 'melody'];
    const cell = arr[s];
    this.snapshot();
    if (Array.isArray(cell)) {
      const i = cell.findIndex(x => (x && typeof x === 'object' ? x.n : x) === n);
      if (i >= 0) cell.splice(i, 1);
      if (!cell.length) arr[s] = null;
    } else {
      arr[s] = null;
    }
    if (this._prSelected) this._prSelected.delete(el.dataset.note + ':' + s);
    this.buildPianoRoll();
  },

  /* ---- multi-select + copy/paste on the piano-roll ---- */
  _prToggleSelect(el, key) {
    this._prSelected = this._prSelected || new Set();
    if (this._prSelected.has(key)) { this._prSelected.delete(key); el.classList.remove('sel'); }
    else { this._prSelected.add(key); el.classList.add('sel'); }
  },

  _prSelectedHits() {
    const out = [];
    if (!this._prSelected) return out;
    this._prSelected.forEach(key => {
      const [track, note, s] = key.split(':');
      const step = +s;
      const cell = this.tracks[track] && this.tracks[track][step];
      if (!cell) return;
      this._cellHits(cell, step, track).forEach(h => { if (h.n === note) out.push({ n: h.n, s: step, track, len: h.len }); });
    });
    return out;
  },

  _prDeleteSelected() {
    const sel = this._prSelectedHits();
    if (!sel.length) return;
    this.snapshot();
    sel.forEach(h => {
      const arr = this.tracks[h.track];
      const cell = arr[h.s];
      if (Array.isArray(cell)) {
        const i = cell.findIndex(x => (x && typeof x === 'object' ? x.n : x) === h.n);
        if (i >= 0) cell.splice(i, 1);
        if (!cell.length) arr[h.s] = null;
      } else if ((cell && typeof cell === 'object' ? cell.n : cell) === h.n) {
        arr[h.s] = null;
      }
    });
    this._prSelected = new Set();
    this._render();
  },

  _prCopySelected() {
    const sel = this._prSelectedHits();
    if (!sel.length) return false;
    const minS = Math.min(...sel.map(h => h.s));
    this._prClipboard = sel.map(h => ({ n: h.n, ds: h.s - minS, track: h.track, len: h.len }));
    return true;
  },

  _prPaste(offsetSteps) {
    const clip = this._prClipboard;
    if (!clip || !clip.length) return;
    const base = (offsetSteps !== undefined) ? offsetSteps : Math.min(...clip.map(h => h.ds)) + 2;
    this.snapshot();
    clip.forEach(h => {
      const s = Math.min(this.steps - 1, base + h.ds);
      const arr = this.tracks[h.track];
      const cur = arr[s];
      const set = (cell) => {
        if (cell === null) arr[s] = h.n;
        else if (typeof cell === 'string') { if (cell !== h.n) arr[s] = [cell, h.n]; }
        else if (Array.isArray(cell)) { if (!cell.some(x => (x && typeof x === 'object' ? x.n : x) === h.n)) cell.push(h.n); }
      };
      set(cur);
      if (this.tracks.noteLen && this.tracks.noteLen[h.track]) this.tracks.noteLen[h.track][s] = h.len;
    });
    this._prSelected = new Set(clip.map(h => h.track + ':' + h.n + ':' + Math.min(this.steps - 1, base + h.ds)));
    this._render();
    // re-mark the pasted notes as selected
    if (typeof document !== 'undefined') {
      this._prSelected.forEach(key => {
        const [track, note, s] = key.split(':');
        const el = document.querySelector(`.pr-note.${track}[data-note="${note}"][data-step="${s}"]`);
        if (el) el.classList.add('sel');
      });
    }
  },

  toggleNote(track, s, n, instId, previewDur, cell) {
    this.snapshot();
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
    const on = this.stepHas(arr[s], n);
    // update just the clicked cell instead of rebuilding the whole roll
    if (cell) cell.classList.toggle('on', on);
    else this.buildRoll();
    if (on) {
      window.TonoraAudio.playNote(this.inst(instId), n, previewDur, this.velocity);
    }
  },

  inst(id) { return window.TONORA_INSTRUMENTS.find(i => i.id === id); },

  stepDur() { return 60 / this.bpm / 4; }, // sixteenth

  togglePlay() { this.playing ? this.stop() : this.start(); },

  /* ---- pattern chain (sections) ---- */
  toggleChainPanel() {
    const p = document.getElementById('cmp-chain-panel');
    if (p) p.classList.toggle('hidden');
    const b = document.getElementById('cmp-chain');
    if (b && p) b.classList.toggle('active', !p.classList.contains('hidden'));
  },

  addSection() {
    this.snapshot();
    if (!Array.isArray(this.sections)) this.sections = [];
    const copy = JSON.parse(JSON.stringify({ steps: this.steps, bpm: this.bpm, tracks: this.tracks }));
    this.sections.push({ name: 'S' + (this.sections.length + 1), ...copy });
    this.renderChainList();
  },

  removeSection(i) {
    this.snapshot();
    this.sections.splice(i, 1);
    this.sections.forEach((s, k) => { s.name = 'S' + (k + 1); });
    this.renderChainList();
  },

  loadSection(i) {
    const sec = this.sections && this.sections[i];
    if (!sec) return;
    this.snapshot();
    this.steps = sec.steps || 32;
    this.bpm = sec.bpm || 120;
    this.tracks = this.normalizeTracks(JSON.parse(JSON.stringify(sec.tracks || {})));
    const lenSel = typeof document !== 'undefined' ? document.getElementById('cmp-len') : null;
    if (lenSel) lenSel.value = this.steps;
    const bpmIn = typeof document !== 'undefined' ? document.getElementById('cmp-bpm') : null;
    if (bpmIn) bpmIn.value = this.bpm;
    if (typeof document !== 'undefined' && document.getElementById('roll')) {
      this.buildRoll();
      if (this.buildMixerUI) this.buildMixerUI();
      this.updateDuration();
    }
  },

  renderChainList() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('chain-list');
    if (!el) return;
    el.innerHTML = '';
    (this.sections || []).forEach((sec, i) => {
      const b = document.createElement('div');
      b.style.cssText = 'display:flex; gap:0.25rem; align-items:center; background:rgba(255,255,255,0.06); border-radius:0.4rem; padding:0.25rem 0.5rem;';
      b.innerHTML = `<button class="btn" data-act="load" title="Load into editor">${sec.name} · ${sec.steps}st</button>
        <button class="btn danger" data-act="del" title="Remove">✕</button>`;
      b.querySelector('[data-act=load]').onclick = () => this.loadSection(i);
      b.querySelector('[data-act=del]').onclick = () => this.removeSection(i);
      el.appendChild(b);
    });
  },

  start() {
    window.TonoraAudio.ensure();
    this.playing = true;
    this._swingMult = 1;
    const playBtn = document.getElementById('cmp-play');
    if (playBtn) { playBtn.classList.add('primary'); playBtn.textContent = '⏸'; }
    const chained = this.chainMode && Array.isArray(this.sections) && this.sections.length > 0;
    if (chained) {
      // stash the live-edited buffer, then walk through sections
      this._chainReturn = { steps: this.steps, bpm: this.bpm, tracks: this.tracks };
      this._chainIdx = 0;
      this._chainCount = this.sections.length;
      this._playSection(this._chainIdx, () => {
        if (this.countIn) this._countIn(() => this._beginAt(0));
        else this._beginAt(0);
      });
    } else if (this.countIn) this._countIn(() => this._beginAt(0));
    else this._beginAt(0);
  },

  /* load section i and invoke done (used by chain playback) */
  _playSection(i, done) {
    const sec = this.sections[i];
    if (!sec) { if (done) done(); return; }
    this.steps = sec.steps || 32;
    this.bpm = sec.bpm || 120;
    this.tracks = this.normalizeTracks(JSON.parse(JSON.stringify(sec.tracks || {})));
    const lenSel = document.getElementById('cmp-len'); if (lenSel) lenSel.value = this.steps;
    const bpmIn = document.getElementById('cmp-bpm'); if (bpmIn) bpmIn.value = this.bpm;
    this.buildRoll();
    if (this.buildMixerUI) this.buildMixerUI();
    this.updateDuration();
    if (done) done();
  },

  /* four-beat count-in, then hand off to the sequencer loop */
  _countIn(done) {
    const clickDur = this.stepDur() * 4; // one beat
    let n = 0;
    const count = () => {
      if (!this.playing) return;
      if (n >= 4) { done(); return; }
      this.click(n === 0);
      n++;
      this.timer = setTimeout(count, clickDur * 1000);
    };
    count();
  },

  /* run the step loop starting at fromStep */
  _beginAt(fromStep) {
    if (!this.playing) return;
    this.step = fromStep;
    // cache row elements once — no per-tick DOM queries, no O(rows²) clearing
    const rows = [...document.querySelectorAll('.roll-row')];
    let prevCells = [];
    const tick = () => {
      if (!this.playing) return;
      const s = this.step;
      this.playStep(s);
      if (this.metronome) this.click(s % 4 === 0);
      prevCells.forEach(c => c.classList.remove('cur'));
      prevCells = rows.map(row => row.children[1 + s]).filter(Boolean);
      prevCells.forEach(c => c.classList.add('cur'));

      let dur = this.stepDur();
      if (this.swing) dur *= (s % 2 === 0) ? 1.33 : 0.67;
      dur *= (this._swingMult || 1);
      this._swingMult = 1;

      const chained = this.chainMode && Array.isArray(this.sections) && this.sections.length > 1;
      if (chained && s >= this.steps - 1) {
        // end of a section → advance to the next one
        this._chainIdx = (this._chainIdx + 1) % this.sections.length;
        const sec = this.sections[this._chainIdx];
        this.steps = sec.steps || 32;
        this.tracks = this.normalizeTracks(JSON.parse(JSON.stringify(sec.tracks || {})));
        const lenSel = document.getElementById('cmp-len'); if (lenSel) lenSel.value = this.steps;
        this.buildRoll();
        this.updateDuration();
        this.step = 0;
        this.timer = setTimeout(tick, dur * 1000);
        return;
      }
      this.step = (this.step + 1) % this.steps;
      this.timer = setTimeout(tick, dur * 1000);
    };
    this._tick = tick;
    tick();
  },

  /* re-anchor the loop at the current step without losing position */
  _reschedule() {
    if (!this.playing) return;
    clearTimeout(this.timer);
    this._swingMult = 1;
    this._beginAt(this.step);
  },

  /* short synthesized metronome tick */
  click(accent) {
    const ctx = window.TonoraAudio.ensure();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = accent ? 1600 : 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.06);
  },

  playStep(s) {
    const stepV = (this.tracks.stepVel && this.tracks.stepVel[s]) || 0;
    const vel = stepV > 0 ? stepV : this.velocity;
    const soloed = this.solo && Object.values(this.solo).some(Boolean);
    const audible = (track) => soloed ? !!this.solo[track] : !(this.muted && this.muted[track]);
    // humanize: random ±ms offset per step for a less robotic feel
    const hz = Math.max(0, Math.min(60, this.humanize || 0));
    const when = hz > 0 ? (Math.random() * 2 - 1) * (hz / 1000) : 0;
    if (audible('melody')) {
      this._cellHits(this.tracks.melody[s], s, 'melody').forEach(h =>
        window.TonoraAudio.playNote(this.inst('piano'), h.n, this.stepDur() * h.len, vel, when, { bus: 'melody' }));
    }
    if (audible('bass')) {
      this._cellHits(this.tracks.bass[s], s, 'bass').forEach(h =>
        window.TonoraAudio.playNote(this.inst('synth'), h.n, this.stepDur() * h.len + this.stepDur(), vel, when, { bus: 'bass' }));
    }
    if (audible('drums')) {
      const d = this.inst('drums');
      // back-compat
      if (this.tracks.drums[s] === true) {
        window.TonoraAudio.playDrum(d, s % 8 === 0 ? 'kick' : (s % 4 === 2 ? 'snare' : 'hat'), vel, when, { bus: 'drums' });
      } else if (typeof this.tracks.drums === 'object' && !Array.isArray(this.tracks.drums)) {
        if (this.tracks.drums.kick && this.tracks.drums.kick[s]) window.TonoraAudio.playDrum(d, 'kick', vel, when, { bus: 'drums' });
        if (this.tracks.drums.snare && this.tracks.drums.snare[s]) window.TonoraAudio.playDrum(d, 'snare', vel, when, { bus: 'drums' });
        if (this.tracks.drums.hat && this.tracks.drums.hat[s]) window.TonoraAudio.playDrum(d, 'hat', vel, when, { bus: 'drums' });
      }
    }
  },

  stop() {
    this.playing = false;
    clearTimeout(this.timer);
    // restore the live buffer after chained playback
    if (this._chainReturn) {
      this.steps = this._chainReturn.steps;
      this.bpm = this._chainReturn.bpm;
      this.tracks = this._chainReturn.tracks;
      this._chainReturn = null;
      this._chainIdx = 0;
      const lenSel = document.getElementById('cmp-len'); if (lenSel) lenSel.value = this.steps;
      const bpmIn = document.getElementById('cmp-bpm'); if (bpmIn) bpmIn.value = this.bpm;
      this.buildRoll();
      if (this.buildMixerUI) this.buildMixerUI();
      this.updateDuration();
    }
    const playBtn = document.getElementById('cmp-play');
    if (playBtn) { playBtn.classList.remove('primary'); playBtn.textContent = '▶'; }
    document.querySelectorAll('.roll-cell.cur').forEach(c => c.classList.remove('cur'));
  },

  save() {
    this.tracks.velocity = this.velocity;
    localStorage.setItem('tonora-compose', JSON.stringify({ bpm: this.bpm, steps: this.steps, tracks: this.tracks }));
    const b = document.getElementById('cmp-save');
    if (b) {
      b.textContent = '✓';
      setTimeout(() => { if (b.isConnected) b.textContent = t('save'); }, 1200);
    }
    TonoraAchievements.unlock('composer');
  },

  exportSong() {
    this.tracks.velocity = this.velocity;
    const data = JSON.stringify({ app: 'tonora', type: 'song', bpm: this.bpm, steps: this.steps, tracks: this.tracks }, null, 2);
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
      const tracksToExport = Object.assign({}, this.tracks, { muted: this.muted, solo: this.solo });
      const blob = await window.renderCompositionToWav(tracksToExport, this.bpm, this.steps, this.swing);
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

  /* copy a #s= share link to the clipboard, navigate compose to it */
  shareSong() {
    try {
      this.tracks.velocity = this.velocity;
      const enc = window.TonoraShare.encode(this.tracks, this.bpm, this.steps);
      const url = location.origin + location.pathname + '#compose?s=' + enc;
      const done = () => {
        const b = document.getElementById('cmp-share');
        if (b) { b.textContent = '✓'; setTimeout(() => { if (b.isConnected) b.textContent = '🔗'; }, 1500); }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => prompt(t('share'), url));
      } else {
        prompt(t('share'), url);
      }
      done();
      TonoraAchievements.unlock('exporter');
    } catch (e) { /* ignore */ }
  },

  /* load a shared payload from ?s=<b64> inside the hash (called on enter) */
  loadShared() {
    try {
      const hash = location.hash || '';
      const m = hash.match(/[?&]s=([A-Za-z0-9\-_]+)/);
      if (!m) return false;
      const data = window.TonoraShare.decode(m[1]);
      if (!data) return false;
      this.snapshot();
      this.steps = data.steps || 32;
      this.bpm = data.bpm || 120;
      this.tracks = this.normalizeTracks(data.tracks || {});
      const lenSel = document.getElementById('cmp-len'); if (lenSel) lenSel.value = this.steps;
      const bpmIn = document.getElementById('cmp-bpm'); if (bpmIn) bpmIn.value = this.bpm;
      this.buildRoll();
      if (this.buildMixerUI) this.buildMixerUI();
      this.updateDuration();
      return true;
    } catch (e) { return false; }
  },

  exportMidi() {
    try {
      const tracksToExport = Object.assign({}, this.tracks, { muted: this.muted, solo: this.solo });
      const bytes = window.buildMidiFile(tracksToExport, this.bpm, this.steps, this.swing);
      const blob = new Blob([bytes], { type: 'audio/midi' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tonora-song.mid';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      TonoraAchievements.unlock('exporter');
    } catch (e) {
      alert('MIDI export failed');
    }
  },

  toSongObject() {
    const notes = [];
    const durBeats = 0.25; // 16th note step = 0.25 beats
    const pushCell = (cell, s, track) => {
      this._cellHits(cell, s, track).forEach(h =>
        notes.push({ n: h.n, t: s * durBeats, d: h.len * durBeats }));
    };
    for (let s = 0; s < this.steps; s++) {
      const mel = this.tracks && this.tracks.melody ? this.tracks.melody[s] : null;
      if (mel) pushCell(mel, s, 'melody');
    }
    // If melody is empty, fallback to bass track
    if (!notes.length && this.tracks && this.tracks.bass) {
      for (let s = 0; s < this.steps; s++) {
        const b = this.tracks.bass[s];
        if (b) pushCell(b, s, 'bass');
      }
    }
    if (!notes.length) return null;
    notes.sort((a, b) => a.t - b.t);
    return {
      id: 'custom-' + Date.now(),
      title: {
        en: 'My Composition',
        fa: 'قطعه ساخته‌شده'
      },
      composer: (typeof getLang === 'function' && getLang() === 'fa') ? 'شما' : 'You',
      difficulty: 1,
      bpm: this.bpm || 120,
      notes
    };
  },

  practiceInLearn() {
    this.stop();
    const song = this.toSongObject();
    if (!song) {
      const msg = (typeof getLang === 'function' && getLang() === 'fa')
        ? 'ابتدا چند نت در پیانورول قرار دهید!'
        : 'Add some notes to the piano roll first!';
      if (typeof alert === 'function') alert(msg);
      return;
    }
    if (typeof window !== 'undefined' && typeof window.navigateTo === 'function') {
      window.navigateTo('learn');
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.LearnMode && window.LearnMode.start) {
          window.LearnMode.start(song);
        }
      }, 50);
    }
  },

  importSong(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d.type === 'song' && d.tracks) {
          this.snapshot();
          if (d.steps) {
            this.steps = d.steps;
            const lenSel = document.getElementById('cmp-len');
            if (lenSel) lenSel.value = this.steps;
          }
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

  /* pick up a captured performance from Play mode (window.__composeInbox).
     Safe to call before the mode has rendered — the data is applied and the
     UI is updated only if the roll is already in the DOM. */
  consumeInbox() {
    const inbox = (typeof window !== 'undefined') ? window.__composeInbox : null;
    if (!inbox) return false;
    window.__composeInbox = null;
    this.snapshot();
    this.steps = inbox.steps || 32;
    this.bpm = inbox.bpm || 120;
    this.tracks = this.normalizeTracks(inbox.tracks || {});
    const lenSel = document.getElementById('cmp-len'); if (lenSel) lenSel.value = this.steps;
    const bpmIn = document.getElementById('cmp-bpm'); if (bpmIn) bpmIn.value = this.bpm;
    if (document.getElementById('roll')) {
      this.buildRoll();
      if (this.buildMixerUI) this.buildMixerUI();
      this.updateDuration();
    }
    return true;
  },

  /* shift every melody+bass note by `semis` semitones (-12..+12) */
  transposeBy(semis) {
    if (!semis) return;
    this.snapshot();
    const SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    const PC = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
    const transNote = (n) => {
      const m = /^([A-G][#b]?)(-?\d+)$/.exec(n);
      if (!m) return n;
      const pc = PC[m[1]];
      if (pc === undefined) return n;
      const midi = pc + (parseInt(m[2], 10) + 1) * 12 + semis;
      if (midi < 0 || midi > 127) return n;
      const names = semis > 0 ? SHARP : FLAT;
      return names[midi % 12] + (Math.floor(midi / 12) - 1);
    };
    const mapCell = (cell) => {
      if (!cell) return cell;
      if (typeof cell === 'string') return transNote(cell);
      if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
        return { ...cell, n: transNote(cell.n) };
      }
      if (Array.isArray(cell)) return cell.map(x => (x && typeof x === 'object') ? { ...x, n: transNote(x.n) } : transNote(x));
      return cell;
    };
    this.tracks.melody = (this.tracks.melody || []).map(mapCell);
    this.tracks.bass = (this.tracks.bass || []).map(mapCell);
    this._render();
  },

  /* rebuild the visible roll only when the editor is in the DOM (safe for tests) */
  _render() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('roll')) this.buildRoll();
  },

  /* nudge every note by ±humanize ms (kept per-step) */
  setHumanize(v) {
    this.humanize = Math.max(0, Math.min(60, +v || 0));
    const humanSlider = document.getElementById('cmp-human');
    if (humanSlider) humanSlider.value = this.humanize;
  },

  /* groove presets: combine swing strength + humanize into a feel */
  applyGroove(key) {
    const G = {
      'straight': { swing: false, human: 0 },
      'shuffle': { swing: true, human: 5 },
      'deep-swing': { swing: true, human: 12 },
      'loose': { swing: false, human: 35 },
      'tight': { swing: false, human: 0 }
    };
    const g = G[key];
    if (!g) return;
    this.swing = g.swing;
    const swingBtn = document.getElementById('cmp-swing');
    if (swingBtn) swingBtn.classList.toggle('active', this.swing);
    this.setHumanize(g.human);
  },

  /* quantize melody + bass note positions to a 16th grid (no-op placeholder: live
     notes are pre-quantized; kept for external file imports) */
  quantize() {
    this.snapshot();
    // notes live on the grid by construction; round any fractional bookkeeping
    this.buildRoll();
  },

  leave() {
    this.stop();
    cancelAnimationFrame(this._meterRaf);
    if (this._onKey) { document.removeEventListener('keydown', this._onKey); this._onKey = null; }
    this.save();
  }
};
