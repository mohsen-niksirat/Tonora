/* Tonora — Notation & animated playback (abcjs wrapper).
   Renders standard notation with abcjs and drives an animated cursor +
   note highlighting using abcjs TimingCallbacks, with sound from the
   shared TonoraAudio engine (no external soundfonts, works offline). */
'use strict';

const TonoraNotation = {
  available() {
    return typeof window !== 'undefined' && !!window.ABCJS;
  },

  /* note name ("C#4") -> ABC token */
  noteToAbc(name) {
    const m = /^([A-G])([#b]?)(-?\d+)$/.exec(name || '');
    if (!m) return '';
    const letter = m[1], acc = m[2], oct = parseInt(m[3], 10);
    let s = letter;
    if (acc === '#') s = '^' + s;
    else if (acc === 'b') s = '_' + s;
    const delta = oct - 4;
    if (delta > 0) {
      s = s.toLowerCase();
      for (let i = 1; i < delta; i++) s += "'";
    } else if (delta < 0) {
      for (let i = 0; i < -delta; i++) s += ',';
    }
    return s;
  },

  /* Build an ABC string from a list of note names, 4 per bar. */
  abcFromNotes(notes, opts) {
    const o = opts || {};
    const tokens = (notes || []).map(n => this.noteToAbc(n));
    let body = '';
    tokens.forEach((tok, i) => {
      body += tok + ' ';
      if ((i + 1) % 4 === 0) body += '| ';
    });
    if (tokens.length % 4 !== 0) body += '|';
    return this._abcHeader(o.title || '', o) + body.trim();
  },

  /* Build an ABC string for a block chord (whole note). */
  abcChord(notes, opts) {
    const o = opts || {};
    const block = '[' + (notes || []).map(n => this.noteToAbc(n)).join('') + ']4 |';
    return this._abcHeader(o.title || '', o) + block;
  },

  _abcHeader(title, o) {
    const qpm = (o && o.qpm) || 100;
    const clef = (o && o.clef) || 'treble';
    return `X:1\nT:${title}\nM:4/4\nL:1/4\nQ:1/4=${qpm}\nK:C clef=${clef}\n`;
  },

  /* Render an ABC string. Returns the abcjs visual object (or null). */
  render(container, abc, opts) {
    if (!this.available() || !container) return null;
    container.innerHTML = '';
    const dark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
    const width = Math.max(260, Math.min(760, (container.clientWidth || 720) - 12));
    const options = Object.assign({
      add_classes: true,
      staffwidth: width,
      scale: 1.1,
      paddingtop: 4,
      paddingbottom: 4,
      foregroundColor: dark ? '#eef1ff' : '#1a2038'
    }, opts || {});
    try {
      const tunes = window.ABCJS.renderAbc(container, abc, options);
      return tunes && tunes[0];
    } catch (e) {
      container.innerHTML = '<p class="muted">Could not render notation.</p>';
      return null;
    }
  },

  /* Play a rendered tune with an animated cursor + note highlighting.
     opts: { qpm, onEvent(names, ev), onBeat(n, total, totalTime), onFinish } */
  play(container, visualObj, opts) {
    if (!this.available() || !visualObj) return null;
    const o = opts || {};
    const svg = container ? container.querySelector('svg') : null;
    const inst = (window.TONORA_INSTRUMENTS || []).find(i => i.id === 'piano') || null;

    const clearHighlights = () => {
      if (svg) svg.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
    };

    let cursor = null;
    const timing = new window.ABCJS.TimingCallbacks(visualObj, {
      qpm: o.qpm,
      beatSubdivisions: 2,
      eventCallback: (ev) => {
        clearHighlights();
        if (!ev) { if (o.onFinish) o.onFinish(); return; }
        if (ev.elements) {
          ev.elements.forEach(group => (group || []).forEach(el => { if (el && el.classList) el.classList.add('highlight'); }));
        }
        if (svg && ev.left != null) {
          if (!cursor) {
            cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            cursor.setAttribute('class', 'tonora-cursor');
            svg.appendChild(cursor);
          }
          cursor.setAttribute('x1', ev.left - 3);
          cursor.setAttribute('x2', ev.left - 3);
          cursor.setAttribute('y1', ev.top);
          cursor.setAttribute('y2', ev.top + ev.height);
        }
        const names = (ev.midiPitches || []).map(p => window.midiToNoteName(p.pitch));
        if (window.TonoraAudio && inst) {
          const msecPerMeasure = ev.millisecondsPerMeasure || 2000;
          (ev.midiPitches || []).forEach(p => {
            const dur = Math.max(0.2, (p.durationInMeasures || 0.25) * msecPerMeasure / 1000 * 0.95);
            window.TonoraAudio.playNote(inst, window.midiToNoteName(p.pitch), dur, Math.max(0.3, (p.volume || 90) / 127));
          });
        }
        if (o.onEvent) o.onEvent(names, ev);
      },
      beatCallback: (n, total, totalTime) => { if (o.onBeat) o.onBeat(n, total, totalTime); }
    });

    try { timing.start(); } catch (e) { return null; }

    return {
      stop() { try { timing.stop(); } catch (e) {} clearHighlights(); if (cursor) { cursor.remove(); cursor = null; } },
      pause() { try { timing.pause(); } catch (e) {} }
    };
  }
};

if (typeof window !== 'undefined') window.TonoraNotation = TonoraNotation;
