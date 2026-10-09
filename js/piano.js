/* Tonora — Piano keyboard UI (touch/mouse/PC keyboard) */
'use strict';

const KEY_MAP = { // PC keyboard → semitone offset from startOctave (C3)
  'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5, 't': 6, 'g': 7, 'y': 8, 'h': 9, 'u': 10, 'j': 11,
  'k': 12, 'o': 13, 'l': 14, 'p': 15, ';': 16, "'": 17, '[': 18, ']': 19
};
const BLACK_MAP = { 0: 'C#', 1: 'D#', 3: 'F#', 4: 'G#', 5: 'A#' };

// Quick reverse lookup for UI hint
const NOTE_TO_KEY = {};
const SEMI_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
for (const [k, off] of Object.entries(KEY_MAP)) {
  const oct = 3 + Math.floor(off / 12);
  const n = SEMI_NAMES[off % 12] + oct;
  if (!NOTE_TO_KEY[n]) NOTE_TO_KEY[n] = k.toUpperCase();
}

class PianoUI {
  constructor(container, opts = {}) {
    this.container = container;
    this.octaves = opts.octaves || 2;
    this.startOctave = opts.startOctave !== undefined ? opts.startOctave : 3;
    this.onNote = opts.onNote || (() => {});
    this.onSustainChange = opts.onSustainChange || (() => {});
    this.keys = {};       // note name -> element
    this.active = new Set();
    this.sustain = false;
    this.sustainedKeys = new Set();
    this.build();
    this._bindPC();
  }

  build() {
    this.container.innerHTML = '';
    this.container.classList.add('piano');
    const whites = [];
    for (let o = 0; o < this.octaves; o++) {
      for (let w = 0; w < 7; w++) {
        const oct = this.startOctave + o;
        const note = ['C','D','E','F','G','A','B'][w] + oct;
        whites.push({ note, idx: o * 7 + w, oct, w });
      }
    }
    const totalWhites = whites.length;

    whites.forEach(({ note, idx, oct, w }) => {
      const k = document.createElement('div');
      k.className = 'key white';
      k.dataset.note = note;
      const keyHint = NOTE_TO_KEY[note] ? `<small class="pc-hint">${NOTE_TO_KEY[note]}</small>` : '';
      k.innerHTML = `<span class="key-label">${note}${keyHint}</span>`;
      this.container.appendChild(k);
      this.keys[note] = k;

      // black key after this white (C#, D#, F#, G#, A#)
      if (BLACK_MAP[w] !== undefined && idx < totalWhites - 1) {
        const bn = BLACK_MAP[w] + oct;
        const bk = document.createElement('div');
        bk.className = 'key black';
        bk.dataset.note = bn;
        const bHint = NOTE_TO_KEY[bn] ? `<small class="pc-hint">${NOTE_TO_KEY[bn]}</small>` : '';
        bk.innerHTML = `<span class="key-label">${bn}${bHint}</span>`;
        // Position at the boundary between this white key and the next
        bk.style.left = `calc(6px + (100% - 12px) * ${(idx + 1) / totalWhites})`;
        this.container.appendChild(bk);
        this.keys[bn] = bk;
      }
    });
    this._bindTouch();
  }

  _bindTouch() {
    const down = (el) => {
      const note = el.dataset.note;
      if (!note || this.active.has(note)) return;
      this.press(note, el);
    };
    const up = (el) => {
      const note = el.dataset.note;
      if (note) this.release(note, el);
    };
    this.container.addEventListener('pointerdown', e => {
      const el = e.target.closest('.key');
      if (!el) return;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      down(el);
      const rel = () => { up(el); el.removeEventListener('pointerup', rel); el.removeEventListener('pointercancel', rel); };
      el.addEventListener('pointerup', rel);
      el.addEventListener('pointercancel', rel);
    });
    // glissando: slide across keys while pressed
    this.container.addEventListener('pointerover', e => {
      if (e.buttons === 0) return;
      const el = e.target.closest('.key');
      if (el) down(el);
    });
  }

  _bindPC() {
    this._pcDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.setSustain(true);
        return;
      }
      if (e.repeat) return;
      const off = KEY_MAP[e.key.toLowerCase()];
      if (off === undefined) return;
      const oct = this.startOctave + Math.floor(off / 12);
      const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      const note = names[off % 12] + oct;
      this.press(note);
    };
    this._pcUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.setSustain(false);
        return;
      }
      const off = KEY_MAP[e.key.toLowerCase()];
      if (off === undefined) return;
      const oct = this.startOctave + Math.floor(off / 12);
      const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      this.release(names[off % 12] + oct);
    };
    window.addEventListener('keydown', this._pcDown);
    window.addEventListener('keyup', this._pcUp);
  }

  setSustain(val) {
    this.sustain = !!val;
    if (!this.sustain) {
      this.sustainedKeys.forEach(n => {
        if (!this.active.has(n)) {
          const el = this.keys[n];
          if (el) el.classList.remove('pressed');
        }
      });
      this.sustainedKeys.clear();
    }
    this.onSustainChange(this.sustain);
  }

  press(note, el) {
    el = el || this.keys[note];
    if (!el || this.active.has(note)) return;
    this.active.add(note);
    this.sustainedKeys.delete(note);
    el.classList.add('pressed');
    this.onNote(note);
  }

  release(note, el) {
    el = el || this.keys[note];
    if (!el) return;
    this.active.delete(note);
    if (this.sustain) {
      this.sustainedKeys.add(note);
      return;
    }
    el.classList.remove('pressed');
  }

  highlight(note, on = true) {
    const el = this.keys[note];
    if (el) el.classList.toggle('hint', on);
  }

  flash(note) {
    const el = this.keys[note];
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 150);
  }

  setStartOctave(oct) {
    this.startOctave = Math.max(1, Math.min(5, oct));
    this.build();
  }

  destroy() {
    window.removeEventListener('keydown', this._pcDown);
    window.removeEventListener('keyup', this._pcUp);
  }
}
