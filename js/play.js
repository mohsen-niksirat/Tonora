/* Tonora — Play mode: pick instrument, jam */
'use strict';

const PlayMode = {
  piano: null,
  current: 'piano',

  enter(root) {
    root.innerHTML = `
      <div class="mode-head">
        <div class="inst-tabs" id="inst-tabs"></div>
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
        onNote: (note) => window.TonoraAudio.playNote(inst, note)
      });
      // resume audio context on first interaction (autoplay policy)
      document.body.addEventListener('pointerdown', () => window.TonoraAudio.ensure(), { once: true });
    }
  },

  leave() {
    if (this.piano) { this.piano.destroy(); this.piano = null; }
    if (this._cleanupDrumKeys) { this._cleanupDrumKeys(); this._cleanupDrumKeys = null; }
  }
};
