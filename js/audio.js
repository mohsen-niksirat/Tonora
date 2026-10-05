/* Tonora — Audio Engine (Web Audio, data-driven synthesis) */
'use strict';

const NOTE_OFFSET = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function noteToFreq(note) {
  const m = note.match(/^([A-G]#?)(\d)$/);
  if (!m) return 440;
  return 440 * Math.pow(2, (NOTE_OFFSET[m[1]] + (parseInt(m[2], 10) + 1) * 12 - 69) / 12);
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverb = null;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      // simple algorithmic reverb (noise impulse)
      this.reverb = this.ctx.createConvolver();
      const len = this.ctx.sampleRate * 1.8;
      const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      this.reverb.buffer = buf;
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.18;
      this.reverb.connect(this.reverbGain);
      this.reverbGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /* Play a note on an instrument definition. dur in seconds (0 = sustain) */
  playNote(instDef, note, dur = 0, vel = 0.8) {
    const ctx = this.ensure();
    const t = ctx.currentTime;
    const freq = typeof note === 'number' ? note : noteToFreq(note);
    const g = ctx.createGain();
    g.connect(this.master);
    g.connect(this.reverb);
    const a = instDef.adsr || { a: 0.01, d: 0.3, s: 0.5, r: 0.2 };
    const peak = vel * 0.5;
    const end = dur > 0 ? t + dur : t + 1.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a.a);
    g.gain.exponentialRampToValueAtTime(Math.max(peak * a.s, 0.0001), t + a.a + a.d);
    if (dur > 0) {
      g.gain.setValueAtTime(Math.max(peak * a.s, 0.0001), Math.max(end - a.r, t + a.a + a.d));
      g.gain.exponentialRampToValueAtTime(0.0001, end);
    }

    const nodes = [];
    switch (instDef.type) {
      case 'additive': {
        instDef.partials.forEach((amp, i) => {
          if (amp < 0.01) return;
          const o = ctx.createOscillator();
          o.type = instDef.wave || 'sine';
          o.frequency.value = freq * (i + 1);
          const og = ctx.createGain();
          og.gain.value = amp;
          o.connect(og); og.connect(g);
          o.start(t); nodes.push(o);
        });
        break;
      }
      case 'subtractive': {
        const o = ctx.createOscillator();
        o.type = instDef.wave || 'sawtooth';
        o.frequency.value = freq;
        const f = ctx.createBiquadFilter();
        f.type = instDef.filter.type;
        f.frequency.value = instDef.filter.freq;
        f.Q.value = instDef.filter.q;
        o.connect(f); f.connect(g);
        o.start(t); nodes.push(o);
        break;
      }
      case 'karplus': {
        // plucked string approximation via filtered noise burst
        const sr = ctx.sampleRate;
        const bufLen = Math.round(sr / freq);
        const buf = ctx.createBuffer(1, bufLen, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const fb = ctx.createGain(); fb.gain.value = 0.985;
        const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 5000;
        src.connect(filt); filt.connect(fb); fb.connect(filt);
        const out = ctx.createGain(); out.gain.value = 1;
        fb.connect(out); out.connect(g);
        src.start(t); nodes.push(src);
        break;
      }
      case 'drumkit':
        return this.playDrum(instDef, note, vel);
    }
    const stop = end + (a.r || 0.3) + 0.1;
    nodes.forEach(n => { n.stop(stop); });
    return { stop: () => { try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); nodes.forEach(n => n.stop(ctx.currentTime + 0.3)); } catch (e) {} } };
  }

  playDrum(instDef, padId, vel = 0.9) {
    const ctx = this.ensure();
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(this.master);
    g.connect(this.reverb);
    const noise = (dur) => {
      const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b; return s;
    };
    switch (padId) {
      case 'kick': {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        g.gain.setValueAtTime(vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); o.start(t); o.stop(t + 0.35);
        break;
      }
      case 'snare': {
        const n = noise(0.2);
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
        g.gain.setValueAtTime(vel * 0.7, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        n.connect(f); f.connect(g); n.start(t);
        const o = ctx.createOscillator(); o.frequency.value = 180;
        const og = ctx.createGain(); og.gain.setValueAtTime(vel * 0.4, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.12);
        break;
      }
      case 'hat': {
        const n = noise(0.06);
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
        g.gain.setValueAtTime(vel * 0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        n.connect(f); f.connect(g); n.start(t);
        break;
      }
      case 'clap': {
        [0, 0.012, 0.025].forEach(off => {
          const n = noise(0.1);
          const ng = ctx.createGain();
          ng.gain.setValueAtTime(vel * 0.5, t + off);
          ng.gain.exponentialRampToValueAtTime(0.001, t + off + 0.08);
          n.connect(ng); ng.connect(g); n.start(t + off);
        });
        break;
      }
      case 'tom': {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.25);
        g.gain.setValueAtTime(vel * 0.8, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); o.start(t); o.stop(t + 0.35);
        break;
      }
      case 'crash': {
        const n = noise(1.2);
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
        g.gain.setValueAtTime(vel * 0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
        n.connect(f); f.connect(g); n.start(t);
        break;
      }
    }
    return { stop: () => {} };
  }
}

window.TonoraAudio = new AudioEngine();
window.noteToFreq = noteToFreq;
