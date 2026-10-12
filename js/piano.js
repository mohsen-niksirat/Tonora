/* Tonora — Piano keyboard UI (touch/mouse/PC keyboard) */
'use strict';

const CODE_MAP = {
  // Octave 1 (0..11) - Two-Tier lower row (Z-M) + Home-Row aliases
  'KeyZ': 0, 'KeyA': 0,
  'KeyS': 1,
  'KeyX': 2,
  'KeyD': 3,
  'KeyC': 4,
  'KeyV': 5, 'KeyF': 5,
  'KeyG': 6,
  'KeyB': 7,
  'KeyH': 8,
  'KeyN': 9,
  'KeyJ': 10,
  'KeyM': 11,

  // Octave 2 (12..24) - Two-Tier upper row (Q-U) + Home-Row aliases (K-L...)
  'KeyQ': 12, 'KeyK': 12,
  'Digit2': 13, 'KeyO': 13,
  'KeyW': 14, 'KeyL': 14,
  'Digit3': 15, 'KeyP': 15,
  'KeyE': 16, 'Semicolon': 16,
  'KeyR': 17, 'Quote': 17,
  'Digit5': 18, 'BracketLeft': 18,
  'KeyT': 19, 'BracketRight': 19,
  'Digit6': 20, 'Backslash': 20,
  'KeyY': 21, 'Digit8': 21,
  'Digit7': 22, 'Digit9': 22,
  'KeyU': 23, 'Digit0': 23,
  'KeyI': 24, 'Minus': 24, 'Equal': 24
};

const KEY_MAP = {
  // Octave 1 (0..11)
  'z': 0, 'a': 0,
  's': 1,
  'x': 2,
  'd': 3,
  'c': 4,
  'v': 5, 'f': 5,
  'g': 6,
  'b': 7,
  'h': 8,
  'n': 9,
  'j': 10,
  'm': 11,

  // Octave 2 (12..24)
  'q': 12, 'k': 12,
  '2': 13, 'o': 13,
  'w': 14, 'l': 14,
  '3': 15, 'p': 15,
  'e': 16, ';': 16,
  'r': 17, "'": 17,
  '5': 18, '[': 18,
  't': 19, ']': 19,
  '6': 20, '\\': 20,
  'y': 21, '8': 21,
  '7': 22, '9': 22,
  'u': 23, '0': 23,
  'i': 24, '-': 24, '=': 24,

  // Persian keyboard mappings
  'ظ': 0, 'ش': 0, 'س': 1, 'ط': 2, 'ی': 3, 'ز': 4, 'ر': 5, 'ب': 5,
  'ل': 6, 'ذ': 7, 'ا': 8, 'د': 9, 'ت': 10, 'پ': 11,
  'ض': 12, 'ن': 12, '۲': 13, 'خ': 13, 'ص': 14, 'م': 14, '۳': 15, 'ح': 15,
  'ث': 16, 'ک': 16, 'ف': 17, 'گ': 17, '۵': 18, 'ج': 18, 'غ': 19, 'چ': 19,
  '۶': 20, 'ع': 21, '۸': 21, '۷': 22, '۹': 22, 'ه': 23, '۰': 23
};

const BLACK_MAP = { 0: 'C#', 1: 'D#', 3: 'F#', 4: 'G#', 5: 'A#' };

const OFF_TO_KEY = {
  // Octave 1
  0: 'Z', 1: 'S', 2: 'X', 3: 'D', 4: 'C', 5: 'V', 6: 'G', 7: 'B', 8: 'H', 9: 'N', 10: 'J', 11: 'M',
  // Octave 2
  12: 'Q', 13: '2', 14: 'W', 15: '3', 16: 'E', 17: 'R', 18: '5', 19: 'T', 20: '6', 21: 'Y', 22: '7', 23: 'U', 24: 'I'
};
const NOTE_TO_KEY = {};

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
    this.tuning = opts.tuning || null;
    this._currentScale = opts.scale || '';
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
        whites.push({ note, idx: o * 7 + w, oct, w, o });
      }
    }
    const totalWhites = whites.length;

    whites.forEach(({ note, idx, oct, w, o }) => {
      const k = document.createElement('div');
      k.className = 'key white';
      k.dataset.note = note;
      k.setAttribute('role', 'button');
      k.setAttribute('aria-label', note);
      const whiteOff = [0, 2, 4, 5, 7, 9, 11][w] + o * 12;
      const pcHint = OFF_TO_KEY[whiteOff] || NOTE_TO_KEY[note] || '';
      const keyHint = pcHint ? `<small class="pc-hint">${pcHint}</small>` : '';
      k.innerHTML = `<span class="key-label">${note}${keyHint}</span>`;
      this.container.appendChild(k);
      this.keys[note] = k;

      // black key after this white (C#, D#, F#, G#, A#)
      if (BLACK_MAP[w] !== undefined && idx < totalWhites - 1) {
        const bn = BLACK_MAP[w] + oct;
        const bk = document.createElement('div');
        bk.className = 'key black';
        bk.dataset.note = bn;
        bk.setAttribute('role', 'button');
        bk.setAttribute('aria-label', bn);
        const blackOff = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10 }[w] + o * 12;
        const bPcHint = OFF_TO_KEY[blackOff] || NOTE_TO_KEY[bn] || '';
        const bHint = bPcHint ? `<small class="pc-hint">${bPcHint}</small>` : '';
        bk.innerHTML = `<span class="key-label">${bn}${bHint}</span>`;
        // Position at the boundary between this white key and the next
        bk.style.left = `calc(6px + (100% - 12px) * ${(idx + 1) / totalWhites})`;
        this.container.appendChild(bk);
        this.keys[bn] = bk;
      }
    });
    this._bindTouch();
    if (this.tuning) this.setTuning(this.tuning);
    if (this._currentScale) this.highlightScale(this._currentScale);
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
    const attachRel = (el) => {
      const rel = () => {
        up(el);
        window.removeEventListener('pointerup', rel);
        window.removeEventListener('pointercancel', rel);
        el.removeEventListener('pointerleave', rel);
      };
      window.addEventListener('pointerup', rel, { once: true });
      window.addEventListener('pointercancel', rel, { once: true });
      el.addEventListener('pointerleave', rel, { once: true });
    };
    this.container.addEventListener('pointerdown', e => {
      const el = e.target.closest('.key');
      if (!el) return;
      down(el);
      attachRel(el);
    });
    // glissando: slide across keys while pressed
    this.container.addEventListener('pointerover', e => {
      if (e.buttons === 0) return;
      const el = e.target.closest('.key');
      if (el) {
        down(el);
        attachRel(el);
      }
    });
  }

  _bindPC() {
    this._pcDown = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.setSustain(true);
        return;
      }
      if (e.repeat) return;
      const off = (e.code && CODE_MAP[e.code] !== undefined)
        ? CODE_MAP[e.code]
        : (e.key ? KEY_MAP[e.key.toLowerCase()] : undefined);
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
      const off = (e.code && CODE_MAP[e.code] !== undefined)
        ? CODE_MAP[e.code]
        : (e.key ? KEY_MAP[e.key.toLowerCase()] : undefined);
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
    const outNote = (this.tuning && this.tuning[note]) ? this.tuning[note] : note;
    this.onNote(outNote);
  }

  setTuning(tuningMap) {
    this.tuning = tuningMap || null;
    for (const note in this.keys) {
      const el = this.keys[note];
      const tuned = this.tuning ? this.tuning[note] : null;
      el.classList.toggle('koron-key', !!(tuned && (tuned.includes('p') || tuned.includes('k'))));
      el.classList.toggle('sori-key', !!(tuned && (tuned.includes('>') || tuned.includes('s'))));
      let badge = el.querySelector('.micro-badge');
      if (tuned && (tuned.includes('p') || tuned.includes('k'))) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'micro-badge';
          el.appendChild(badge);
        }
        badge.textContent = '𝄹';
      } else if (tuned && (tuned.includes('>') || tuned.includes('s'))) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'micro-badge';
          el.appendChild(badge);
        }
        badge.textContent = '𝄰';
      } else if (badge) {
        badge.remove();
      }
    }
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

  highlightScale(scaleType) {
    this._currentScale = scaleType || '';
    const SCALE_DEGREES = {
      major:      { root: 0, intervals: [0, 2, 4, 5, 7, 9, 11] },
      minor:      { root: 9, intervals: [9, 11, 0, 2, 4, 5, 7] },
      pentatonic: { root: 0, intervals: [0, 2, 4, 7, 9] },
      blues:      { root: 9, intervals: [9, 0, 2, 3, 4, 7] },
      shur:       { root: 2, intervals: [2, 3, 5, 7, 8, 10, 0] },
      segah:      { root: 4, intervals: [4, 5, 7, 9, 11, 0, 2] },
      homayoun:   { root: 7, intervals: [7, 8, 11, 0, 2, 3, 5] },
      esfahan:    { root: 2, intervals: [2, 4, 5, 7, 9, 10, 0] },
      chahargah:  { root: 0, intervals: [0, 1, 4, 5, 7, 8, 11] }
    };
    const def = SCALE_DEGREES[scaleType];
    const pitchClasses = def ? new Set(def.intervals) : null;
    const rootPc = def ? def.root : null;
    const BASE_PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

    for (const note in this.keys) {
      const el = this.keys[note];
      if (!pitchClasses) {
        el.classList.remove('scale-hint', 'scale-root');
        continue;
      }
      const m = /^([A-G]#?)/.exec(note);
      const pc = m ? BASE_PC[m[1]] : -1;
      const inScale = pitchClasses.has(pc);
      const isRoot = pc === rootPc;
      el.classList.toggle('scale-hint', inScale);
      el.classList.toggle('scale-root', isRoot);
    }
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
