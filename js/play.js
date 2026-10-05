/* Tonora — Play mode: instrument jam + Web MIDI input.
   v2: MIDI device selector (hidden when unsupported). */
'use strict';

const PlayMode = {
  piano: null,
  current: 'piano',
  midi: null,        // {access, input}

  enter(root) {
    root.innerHTML = `
      <div class="mode-head">
        <div class="inst-tabs" id="inst-tabs"></div>
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
    this.select('piano');
    this.initMIDI();
  },

  select(id) {
    const inst = window.TONORA_INSTRUMENTS.find(i => i.id === id);
    this.current = id;
    document.querySelectorAll('.inst-tab').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    const surf = document.getElementById('play-surface');
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
        onNote: (note) => { window.TonoraAudio.playNote(inst, note); }
      });
      // resume audio context on first interaction (autoplay policy)
      document.body.addEventListener('pointerdown', () => window.TonoraAudio.ensure(), { once: true });
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
          const inst = window.TONORA_INSTRUMENTS.find(i => i.id === 'drums');
          const pads = inst.pads;
          window.TonoraAudio.playDrum(inst, pads[note % pads.length].id, Math.max(0.4, vel / 127));
          const padEls = document.querySelectorAll('.drum-pad');
          const el = padEls[note % pads.length];
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
  }
};
