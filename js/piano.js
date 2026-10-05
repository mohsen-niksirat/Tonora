/* Tonora — Piano keyboard UI (touch/mouse/PC keyboard) */
'use strict';

const KEY_MAP = { // PC keyboard → semitone offset from C4
  'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5, 't': 6, 'g': 7, 'y': 8, 'h': 9, 'u': 10, 'j': 11,
  'k': 12, 'o': 13, 'l': 14, 'p': 15, ';': 16, "'": 17
};
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_AFTER = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 };

class PianoUI {
  constructor(container, opts = {}) {
    this.container = container;
    this.octaves = opts.octaves || 2;
    this.startOctave = opts.startOctave !== undefined ? opts.startOctave : 3;
    this.onNote = opts.onNote || (() => {});
    this.keys = {};       // note name -> element
    this.active = new Set();
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
        whites.push({ note, idx: o * 7 + w });
      }
    }
    whites.forEach(({ note, idx }) => {
      const k = document.createElement('div');
      k.className = 'key white';
      k.dataset.note = note;
      k.innerHTML = `<span class="key-label">${note}</span>`;
      this.container.appendChild(k);
      this.keys[note] = k;
      // black key after this white (if pattern says so and not last overall)
      const w = idx % 7;
      if (BLACK_AFTER[w] !== undefined && (idx < whites.length - 1 || w < 5)) {
        const bn = ['C#','D#','F#','G#','A#'][[0,2,5,7,9].indexOf(w)] + note.slice(-1);
        const bk = document.createElement('div');
        bk.className = 'key black';
        bk.dataset.note = bn;
        bk.innerHTML = `<span class="key-label">${bn}</span>`;
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
      if (e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const off = KEY_MAP[e.key.toLowerCase()];
      if (off === undefined) return;
      const oct = this.startOctave + Math.floor(off / 12);
      const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      const note = names[off % 12] + oct;
      this.press(note);
    };
    this._pcUp = (e) => {
      const off = KEY_MAP[e.key.toLowerCase()];
      if (off === undefined) return;
      const oct = this.startOctave + Math.floor(off / 12);
      const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      this.release(names[off % 12] + oct);
    };
    window.addEventListener('keydown', this._pcDown);
    window.addEventListener('keyup', this._pcUp);
  }

  press(note, el) {
    el = el || this.keys[note];
    if (!el || this.active.has(note)) return;
    this.active.add(note);
    el.classList.add('pressed');
    this.onNote(note);
  }

  release(note, el) {
    el = el || this.keys[note];
    if (!el) return;
    this.active.delete(note);
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

  destroy() {
    window.removeEventListener('keydown', this._pcDown);
    window.removeEventListener('keyup', this._pcUp);
  }
}
