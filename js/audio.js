/* Tonora — Audio Engine (Web Audio, data-driven synthesis) */
'use strict';

const NOTE_OFFSET = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function noteToFreq(note) {
  const m = note.match(/^([A-G]#?)(\d)$/);
  if (!m) return 440;
  return 440 * Math.pow(2, (NOTE_OFFSET[m[1]] + (parseInt(m[2], 10) + 1) * 12 - 69) / 12);
}

function makeReverbBuffer(ctx) {
  const len = Math.floor(ctx.sampleRate * 1.8);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      lp += 0.35 * (w - lp); // natural acoustic high-frequency absorption
      d[i] = lp * Math.pow(1 - i / len, 2.8);
    }
  }
  return buf;
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverb = null;
    this._reviving = false;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      // Studio brickwall limiter compressor to prevent digital clipping
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.15;
      this.master.connect(this.limiter);
      // Analyser for real-time visualizer
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.limiter.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      // simple algorithmic reverb (noise impulse)
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = makeReverbBuffer(this.ctx);
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.18;
      this.reverb.connect(this.reverbGain);
      this.reverbGain.connect(this.master);
      // track context state for debugging + revival UX
      this.ctx.onstatechange = () => {
        console.debug('[Tonora] AudioContext state →', this.ctx.state);
        if (this.ctx.state === 'suspended') this.showPausedToast();
      };
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /* Revive a suspended context; returns true when audio is running. */
  async revive() {
    if (!this.ctx) { this.ensure(); return this.ctx.state === 'running'; }
    if (this.ctx.state === 'running') return true;
    try {
      await this.ctx.resume();
      console.debug('[Tonora] revive() →', this.ctx.state);
    } catch (e) {
      console.debug('[Tonora] revive() rejected:', e && e.message);
    }
    return this.ctx.state === 'running';
  }

  setMasterGain(val) {
    if (this.master && this.ctx) {
      const v = Math.max(0, Math.min(1.2, val));
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    }
  }

  setReverbGain(val) {
    if (this.reverbGain && this.ctx) {
      const v = Math.max(0, Math.min(1.5, val));
      this.reverbGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    }
  }

  getVisualizerData() {
    if (!this.analyser) return null;
    if (!this._visData) this._visData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this._visData);
    return this._visData;
  }

  startLiveRecording() {
    this.ensure();
    if (typeof MediaRecorder === 'undefined') return false;
    if (this._mediaRecorder && this._mediaRecorder.state === 'recording') return false;
    if (!this._recDest) {
      this._recDest = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this._recDest);
    }
    this._recChunks = [];
    const mime = (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
      ? 'audio/webm;codecs=opus' : '';
    this._mediaRecorder = mime ? new MediaRecorder(this._recDest.stream, { mimeType: mime }) : new MediaRecorder(this._recDest.stream);
    this._mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this._recChunks.push(e.data); };
    this._mediaRecorder.start(200);
    this._recStartTime = performance.now();
    return true;
  }

  stopLiveRecording() {
    return new Promise((resolve) => {
      if (!this._mediaRecorder || this._mediaRecorder.state !== 'recording') { resolve(null); return; }
      this._mediaRecorder.onstop = () => {
        const dur = (performance.now() - this._recStartTime) / 1000;
        const blob = new Blob(this._recChunks, { type: this._mediaRecorder.mimeType || 'audio/webm' });
        resolve({ blob, dur });
      };
      this._mediaRecorder.stop();
    });
  }

  showPausedToast() {
    if (this._reviving) return;
    this._reviving = true;
    const toast = document.createElement('div');
    toast.className = 'ach-toast';
    toast.innerHTML = `<span class="big">🔇</span> ${t('audioPaused')}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 30);
    const dismiss = () => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
      this._reviving = false;
    };
    setTimeout(dismiss, 4000);
    this._toastDismiss = dismiss;
  }

  /* Called by note entry points; schedules anyway but warns when muted. */
  guard() {
    if (this.ctx && this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
      if (this.ctx.state !== 'running') this.showPausedToast();
    }
  }

  /* Play a note on an instrument definition. dur in seconds (0 = sustain), optional when */
  playNote(instDef, note, dur = 0, vel = 0.8, when = 0) {
    const ctx = this.ensure();
    this.guard();
    const t = when > 0 ? when : ctx.currentTime;
    return this.scheduleNote(ctx, this.master, this.reverb, instDef, note, dur, vel, t);
  }

  /* Core synthesis — works on any BaseAudioContext (live or offline) */
  scheduleNote(ctx, master, reverb, instDef, note, dur = 0, vel = 0.8, when = 0) {
    const t = when;
    const freq = typeof note === 'number' ? note : noteToFreq(note);
    const g = ctx.createGain();
    g.connect(master);
    if (reverb) g.connect(reverb);
    const a = instDef.adsr || { a: 0.01, d: 0.3, s: 0.5, r: 0.2 };
    const peak = vel * 0.5;
    const end = dur > 0 ? t + dur : t + 1.5;

    let naturalDur = 0;   // >0 when the source buffer carries its own decay
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
        // Karplus–Strong plucked string, rendered sample-by-sample into a buffer.
        // We deliberately do NOT build a Web Audio feedback cycle
        // (src → filter → gain → filter): in the spec a cycle is only
        // well-defined when it contains a DelayNode, and in practice Chrome
        // emits NaN for this topology — the NaN poisons the master bus and
        // silences the ENTIRE app until reload. Pre-rendering the decaying
        // string is deterministic and identical in live and offline contexts.
        const sr = ctx.sampleRate;
        const N = Math.max(2, Math.round(sr / freq));     // string period
        const durSec = instDef.dur || 3.0;
        const total = Math.max(N + 1, Math.floor(sr * durSec));
        const buf = ctx.createBuffer(1, total, sr);
        const out = buf.getChannelData(0);
        // 1) seed = white noise through a one-pole lowpass (no metallic snap)
        const ring = new Float32Array(N);
        let lp = 0;
        for (let i = 0; i < N; i++) {
          const w = Math.random() * 2 - 1;
          lp += 0.5 * (w - lp);
          ring[i] = lp;
        }
        // 2) feed the delay line its own averaged output each step — the
        //    two-point average is the damping lowpass of the classic algorithm
        const damp = instDef.damping || 0.9965;
        let ptr = 0;
        for (let n = 0; n < total; n++) {
          const cur = ring[ptr];
          out[n] = cur;
          const nxt = ring[(ptr + 1) % N];
          ring[ptr] = 0.5 * (cur + nxt) * damp;
          ptr = (ptr + 1) % N;
        }
        // 3) short attack fade to avoid a click on the first sample
        const fade = Math.min(64, Math.floor(sr * 0.002));
        for (let i = 0; i < fade; i++) out[i] *= i / fade;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start(t);
        nodes.push(src);
        naturalDur = durSec;
        break;
      }
      case 'fm': {
        // FM: carrier + modulator (soft, flute-like)
        const car = ctx.createOscillator();
        car.type = 'sine';
        car.frequency.value = freq;
        const mod = ctx.createOscillator();
        mod.type = 'sine';
        mod.frequency.value = freq * (instDef.ratio || 2);
        const modGain = ctx.createGain();
        modGain.gain.value = freq * (instDef.index || 0.4);
        mod.connect(modGain); modGain.connect(car.frequency);
        car.connect(g);
        car.start(t); mod.start(t); nodes.push(car, mod);
        break;
      }
      case 'celesta': {
        // additive with fast decay + inharmonic partials
        instDef.partials.forEach((amp, i) => {
          if (amp < 0.01) return;
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = freq * instDef.ratios[i];
          const og = ctx.createGain();
          og.gain.setValueAtTime(amp, t);
          og.gain.exponentialRampToValueAtTime(0.0001, t + (instDef.decay || 1.2));
          o.connect(og); og.connect(g);
          o.start(t); nodes.push(o);
        });
        break;
      }
      case 'distorted': {
        const o = ctx.createOscillator();
        o.type = instDef.wave || 'sawtooth';
        o.frequency.value = freq;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 2500; // roll off excessive fizz
        const shaper = ctx.createWaveShaper();
        const k = instDef.drive || 200;
        const curve = new Float32Array(44100);
        const deg = Math.PI / 180;
        for (let i = 0; i < 44100; ++i) {
          const x = (i * 2) / 44100 - 1;
          curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        shaper.curve = curve;
        shaper.oversample = '4x';
        o.connect(shaper); shaper.connect(f); f.connect(g);
        o.start(t); nodes.push(o);
        break;
      }
      case 'drumkit':
        return this.scheduleDrum(ctx, master, reverb, instDef, note, vel, t);
    }
    const stop = end + (a.r || 0.3) + 0.1;
    // Envelope: karplus buffers already contain their own pluck decay, so we
    // only apply attack/release shaping — no sustain hold that would truncate
    // or re-lengthen the natural string decay.
    if (naturalDur > 0) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + Math.max(a.a, 0.001));
      g.gain.setValueAtTime(peak, t + naturalDur);
      g.gain.linearRampToValueAtTime(0.0001, t + naturalDur + 0.05);
      nodes.forEach(n => { n.stop(t + naturalDur + 0.1); });
      return { stop: () => { try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); nodes.forEach(n => n.stop(ctx.currentTime + 0.3)); } catch (e) {} } };
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a.a);
    g.gain.exponentialRampToValueAtTime(Math.max(peak * a.s, 0.0001), t + a.a + a.d);
    if (dur > 0) {
      g.gain.setValueAtTime(Math.max(peak * a.s, 0.0001), Math.max(end - a.r, t + a.a + a.d));
      g.gain.exponentialRampToValueAtTime(0.0001, end);
    }
    nodes.forEach(n => { n.stop(stop); });
    return { stop: () => { try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); nodes.forEach(n => n.stop(ctx.currentTime + 0.3)); } catch (e) {} } };
  }

  playDrum(instDef, padId, vel = 0.9, when = 0) {
    const ctx = this.ensure();
    this.guard();
    const t = when > 0 ? when : ctx.currentTime;
    return this.scheduleDrum(ctx, this.master, this.reverb, instDef, padId, vel, t);
  }

  scheduleDrum(ctx, master, reverb, instDef, padId, vel, when) {
    const t = when;
    const g = ctx.createGain();
    g.connect(master);
    if (reverb) g.connect(reverb);
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
        o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.12);
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

/* ---- Audio auto-revival ----
   A single document-level gesture listener that un-suspends the AudioContext.
   Re-armed after every mode switch (mode entry points call armAudioRevive()),
   so a context that Chrome suspended mid-session recovers on the next click/key
   instead of staying silent until a full page refresh. */
function armAudioRevive() {
  if (window._tonoraReviveOff) window._tonoraReviveOff();
  const handler = () => {
    const engine = window.TonoraAudio;
    if (!engine.ctx) return;              // nothing to revive yet
    engine.revive().then(ok => {
      if (ok && window._tonoraReviveOff) { window._tonoraReviveOff(); window._tonoraReviveOff = null; }
    });
  };
  const evs = ['pointerdown', 'keydown', 'touchstart'];
  evs.forEach(e => document.addEventListener(e, handler, { passive: true }));
  window._tonoraReviveOff = () => evs.forEach(e => document.removeEventListener(e, handler));
}
window.armAudioRevive = armAudioRevive;


/* ---- WAV export (OfflineAudioContext render → 16-bit PCM) ---- */

function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(ab);
  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);          // PCM
  dv.setUint16(22, numCh, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * blockAlign, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 16, true);
  wstr(36, 'data');
  dv.setUint32(40, dataSize, true);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let v = Math.max(-1, Math.min(1, chans[c][i]));
      dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

/* Render a compose-style composition offline and download as WAV */
async function renderCompositionToWav(tracks, bpm, steps, swing) {
  const baseDur = 60 / bpm / 4;
  const totalDur = steps * baseDur + 2.5; // tail for reverb/release
  const sr = 44100;
  const off = new OfflineAudioContext(2, Math.ceil(totalDur * sr), sr);
  const master = off.createGain();
  master.gain.value = 0.7;
  const limiter = off.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(limiter);
  limiter.connect(off.destination);
  const reverb = off.createConvolver();
  reverb.buffer = makeReverbBuffer(off);
  const rg = off.createGain();
  // match global settings if defined, else fallback
  const globalRev = localStorage.getItem('tonora-reverb');
  rg.gain.value = globalRev !== null ? +globalRev : 0.18;
  reverb.connect(rg); rg.connect(master);
  const eng = window.TonoraAudio;
  const inst = id => window.TONORA_INSTRUMENTS.find(i => i.id === id);
  const vel = (tracks.velocity !== undefined) ? tracks.velocity : 0.8;
  
  let currentWhen = 0;
  for (let s = 0; s < steps; s++) {
    const when = currentWhen;
    let dur = baseDur;
    if (swing) dur *= (s % 2 === 0) ? 1.33 : 0.67;
    currentWhen += dur;

    const mel = tracks.melody[s];
    if (mel) {
      const notesArr = Array.isArray(mel) ? mel : [mel];
      notesArr.forEach(n => eng.scheduleNote(off, master, reverb, inst('piano'), n, dur * 2, vel, when));
    }
    const bass = tracks.bass[s];
    if (bass) {
      const notesArr = Array.isArray(bass) ? bass : [bass];
      notesArr.forEach(n => eng.scheduleNote(off, master, reverb, inst('synth'), n, dur * 3, vel, when));
    }
    if (tracks.drums[s]) {
      eng.scheduleDrum(off, master, reverb, inst('drums'), s % 8 === 0 ? 'kick' : (s % 4 === 2 ? 'snare' : 'hat'), vel, when);
    }
  }
  const rendered = await off.startRendering();
  return audioBufferToWav(rendered);
}
window.renderCompositionToWav = renderCompositionToWav;

