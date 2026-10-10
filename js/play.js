/* Tonora — Play mode: instrument jam + Web MIDI input.
   v2: MIDI device selector (hidden when unsupported). */
'use strict';

const PlayMode = {
  piano: null,
  current: 'piano',
  octave: 3,
  midi: null,        // {access, input}

  inst(id) {
    return window.TONORA_INSTRUMENTS.find(i => i.id === id);
  },

  /* (re)arm the document-level audio revival listeners */
  armRevive() {
    if (typeof window.armAudioRevive === 'function') window.armAudioRevive();
  },

  enter(root) {
    this.armRevive();
    root.innerHTML = `
      <div class="mode-head">
        <div class="inst-tabs" id="inst-tabs"></div>
        <div class="octave-box" id="octave-box">
          <button class="btn oct-btn" id="oct-down" title="${t('octave')} -">◀</button>
          <span class="oct-lbl" id="oct-lbl">C${this.octave}–B${this.octave + 1}</span>
          <button class="btn oct-btn" id="oct-up" title="${t('octave')} +">▶</button>
        </div>
        <button class="btn toggle-btn" id="sustain-btn" title="Space">🦶 ${t('sustain')}</button>
        <button class="btn toggle-btn" id="arp-btn" title="Hold notes to arpeggiate">🎶 Arp</button>
        <button class="btn" id="rec-btn" title="Record live session">⏺ ${t('record')}</button>
        <div class="midi-box hidden" id="midi-box"></div>
      </div>
      <div id="play-surface" class="play-surface"></div>
    `;
    const tabs = root.querySelector('#inst-tabs');
    window.TONORA_INSTRUMENTS.forEach(inst => {
      const b = document.createElement('button');
      b.className = 'inst-tab';
      b.dataset.id = inst.id;
      b.innerHTML = `<span>${inst.icon}</span> ${inst.name[getLang()] || inst.name.en}`;
      b.onclick = () => this.select(inst.id);
      tabs.appendChild(b);
    });
    root.querySelector('#oct-down').onclick = () => {
      if (this.octave > 2) { this.octave--; this.updateOctave(); }
    };
    root.querySelector('#oct-up').onclick = () => {
      if (this.octave < 4) { this.octave++; this.updateOctave(); }
    };
    const susBtn = root.querySelector('#sustain-btn');
    if (susBtn) {
      susBtn.onclick = () => {
        if (this.piano) this.piano.setSustain(!this.piano.sustain);
      };
    }
    this.arpActive = false;
    this.arpTimer = null;
    this.arpIndex = 0;
    const arpBtn = root.querySelector('#arp-btn');
    if (arpBtn) {
      arpBtn.onclick = () => {
        this.arpActive = !this.arpActive;
        arpBtn.classList.toggle('active', this.arpActive);
        if (!this.arpActive && this.arpTimer) {
          clearInterval(this.arpTimer);
          this.arpTimer = null;
        } else if (this.arpActive) {
          this.arpTimer = setInterval(() => {
            if (!this.piano || this.piano.activeKeys.size === 0) return;
            const keys = Array.from(this.piano.activeKeys).sort((a,b) => noteToFreq(a) - noteToFreq(b));
            if (keys.length === 0) return;
            this.arpIndex = (this.arpIndex + 1) % keys.length;
            const note = keys[this.arpIndex];
            const def = this.inst(this.current);
            window.TonoraAudio.playNote(def, note, 0.15, 0.8, 0, {}, window.TonoraAudio.delay);
          }, 150); // ~100bpm 16th notes
        }
      };
    }
    const recBtn = root.querySelector('#rec-btn');
    if (recBtn) {
      recBtn.onclick = async () => {
        if (window.TonoraAudio.isRecording) {
          recBtn.classList.remove('recording');
          recBtn.innerHTML = `⏺ ${t('record')}`;
          const blob = await window.TonoraAudio.stopLiveRecording();
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tonora-jam-${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            TonoraAchievements.unlock('exporter');
          }
        } else {
          const started = window.TonoraAudio.startLiveRecording();
          if (started) {
            recBtn.classList.add('recording');
            recBtn.innerHTML = `⏹ ${t('stopRec')}`;
          }
        }
      };
    }
    this.select('piano');
    this.initMIDI();
  },

  updateOctave() {
    const lbl = document.getElementById('oct-lbl');
    if (lbl) lbl.textContent = `C${this.octave}–B${this.octave + 1}`;
    if (this.piano) this.piano.setStartOctave(this.octave);
  },

  select(id) {
    const inst = window.TONORA_INSTRUMENTS.find(i => i.id === id);
    this.current = id;
    document.querySelectorAll('.inst-tab').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    const surf = document.getElementById('play-surface');
    const octBox = document.getElementById('octave-box');
    if (octBox) octBox.classList.toggle('hidden', inst.type === 'drumkit');
    const susBtn = document.getElementById('sustain-btn');
    if (susBtn) susBtn.classList.toggle('hidden', inst.type === 'drumkit');
    if (this.piano) { this.piano.destroy(); this.piano = null; }
    if (inst.type === 'drumkit') {
      surf.innerHTML = '<div class="drum-grid" id="drum-grid"></div>';
      const grid = document.getElementById('drum-grid');
      inst.pads.forEach(pad => {
        const p = document.createElement('button');
        p.className = 'drum-pad';
        p.style.setProperty('--pad-color', pad.color);
        p.innerHTML = `<strong>${pad.name[getLang()] || pad.name.en}</strong><small>${pad.key}</small>`;
        const hit = () => { window.TonoraAudio.playDrum(inst, pad.id); p.classList.add('hit'); setTimeout(() => p.classList.remove('hit'), 120); };
        p.addEventListener('pointerdown', hit);
        p._key = pad.key.toLowerCase();
        p._hit = hit;
        grid.appendChild(p);
      });
      this._drumKeys = (e) => {
        if (e.repeat) return;
        const pad = [...grid.children].find(p => p._key === e.key.toLowerCase());
        if (pad) pad._hit();
      };
      window.addEventListener('keydown', this._drumKeys);
      this._cleanupDrumKeys = () => window.removeEventListener('keydown', this._drumKeys);
    } else {
      if (this._cleanupDrumKeys) { this._cleanupDrumKeys(); this._cleanupDrumKeys = null; }
      surf.innerHTML = '<div id="piano-keys"></div>';
      this.piano = new PianoUI(document.getElementById('piano-keys'), {
        octaves: 2,
        startOctave: this.octave,
        onNote: (note) => {
          const dur = (this.piano && this.piano.sustain) ? 3.0 : 0;
          window.TonoraAudio.playNote(inst, note, dur);
        },
        onSustainChange: (active) => {
          const b = document.getElementById('sustain-btn');
          if (b) b.classList.toggle('active', active);
        }
      });
      // resume audio context on first interaction (autoplay policy)
      document.body.addEventListener('pointerdown', () => window.TonoraAudio.ensure(), { once: true });
      this.armRevive();
    }
  },

  /* ---- Web MIDI ---- */
  async initMIDI() {
    if (!navigator.requestMIDIAccess) return; // feature stays hidden
    try {
      const access = await navigator.requestMIDIAccess();
      this.midi = { access, input: null };
      this.renderMidiBox();
      access.onstatechange = () => this.renderMidiBox();
    } catch (e) { /* user denied — stay hidden */ }
  },

  renderMidiBox() {
    const box = document.getElementById('midi-box');
    if (!box || !this.midi) return;
    const inputs = [...this.midi.access.inputs.values()];
    if (!inputs.length) { box.classList.remove('hidden'); box.innerHTML = `<span class="muted">${t('noMidi')}</span>`; return; }
    box.classList.remove('hidden');
    const sel = document.createElement('select');
    sel.innerHTML = `<option value="">${t('midiDevices')}</option>` +
      inputs.map((inp, i) => `<option value="${i}">${inp.name}</option>`).join('');
    sel.onchange = () => this.bindMidiInput(inputs[+sel.value] || null);
    box.innerHTML = '';
    box.appendChild(sel);
    if (!this.midi.input && inputs.length === 1) {
      sel.value = '0';
      this.bindMidiInput(inputs[0]);
    }
  },

  bindMidiInput(input) {
    if (this.midi.input) this.midi.input.onmidimessage = null;
    this.midi.input = input;
    if (!input) return;
    input.onmidimessage = (msg) => {
      const [status, note, vel] = msg.data;
      const cmd = status & 0xF0;
      const name = this.midiNoteName(note);
      if (cmd === 0x90 && vel > 0) {
        if (this.current === 'drums') {
          // only map the GM drum range (36–47) onto pads; ignore the rest
          if (note < 36 || note > 47) return;
          const inst = window.TONORA_INSTRUMENTS.find(i => i.id === 'drums');
          const pads = inst.pads;
          const padIdx = (note - 36) % pads.length;
          window.TonoraAudio.playDrum(inst, pads[padIdx].id, Math.max(0.4, vel / 127));
          const padEls = document.querySelectorAll('.drum-pad');
          const el = padEls[padIdx];
          if (el) { el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 120); }
        } else if (this.piano) {
          window.TonoraAudio.playNote(this.inst(this.current), name, 0, Math.max(0.4, vel / 127));
          this.piano.press(name);
          setTimeout(() => this.piano.release(name), 200);
        }
        TonoraAchievements.unlock('midi');
      } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
        if (this.piano) this.piano.release(name);
      }
    };
  },

  midiNoteName(n) {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const oct = Math.floor(n / 12) - 1;
    return names[n % 12] + oct;
  },

  leave() {
    if (this.piano) { this.piano.destroy(); this.piano = null; }
    if (this._cleanupDrumKeys) { this._cleanupDrumKeys(); this._cleanupDrumKeys = null; }
    if (this.midi && this.midi.input) this.midi.input.onmidimessage = null;
    if (this.arpTimer) { clearInterval(this.arpTimer); this.arpTimer = null; }
    this.arpActive = false;
  }
};
