/* Tonora — Audio Engine (Web Audio, data-driven synthesis) */
'use strict';

const NOTE_OFFSET = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function noteToFreq(note) {
  const m = String(note || '').match(/^([A-G])([#bpk>]?)(-?\d)$/);
  if (!m) return 440;
  const baseLetter = m[1];
  const acc = m[2];
  const oct = parseInt(m[3], 10);
  let semi = NOTE_OFFSET[baseLetter];
  if (acc === '#') semi += 1;
  else if (acc === 'b') semi -= 1;
  else if (acc === 'p' || acc === 'k') semi -= 0.5; // Koron (quarter-tone flat)
  else if (acc === '>' || acc === 's') semi += 0.5; // Sori (quarter-tone sharp)
  return 440 * Math.pow(2, (semi + (oct + 1) * 12 - 69) / 12);
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
    this.buses = {};
    this._voices = [];
    this.eq = { bass: 0, mid: 0, treble: 0 };
    this.chorus = { wet: 0, rate: 1.5, depth: 0.002 };
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;

      // 3-Band Equalizer (Bass 100Hz, Mid 1kHz, Treble 3.2kHz)
      this.eqBass = this.ctx.createBiquadFilter();
      this.eqBass.type = 'lowshelf';
      this.eqBass.frequency.value = 100;
      this.eqBass.gain.value = this.eq.bass;

      this.eqMid = this.ctx.createBiquadFilter();
      this.eqMid.type = 'peaking';
      this.eqMid.frequency.value = 1000;
      this.eqMid.Q.value = 1.0;
      this.eqMid.gain.value = this.eq.mid;

      this.eqTreble = this.ctx.createBiquadFilter();
      this.eqTreble.type = 'highshelf';
      this.eqTreble.frequency.value = 3200;
      this.eqTreble.gain.value = this.eq.treble;

      this.master.connect(this.eqBass);
      this.eqBass.connect(this.eqMid);
      this.eqMid.connect(this.eqTreble);

      // Stereo Chorus FX (LFO modulated dual delay)
      this.chorusDry = this.ctx.createGain();
      this.chorusDry.gain.value = 1.0;
      this.chorusWet = this.ctx.createGain();
      this.chorusWet.gain.value = this.chorus.wet;

      this.chorusDelayL = this.ctx.createDelay(0.1);
      this.chorusDelayR = this.ctx.createDelay(0.1);
      this.chorusDelayL.delayTime.value = 0.020;
      this.chorusDelayR.delayTime.value = 0.022;

      this.chorusLfo = this.ctx.createOscillator();
      this.chorusLfo.type = 'sine';
      this.chorusLfo.frequency.value = this.chorus.rate;

      this.chorusDepthL = this.ctx.createGain();
      this.chorusDepthL.gain.value = this.chorus.depth;
      this.chorusDepthR = this.ctx.createGain();
      this.chorusDepthR.gain.value = -this.chorus.depth;

      this.chorusLfo.connect(this.chorusDepthL);
      this.chorusLfo.connect(this.chorusDepthR);
      this.chorusDepthL.connect(this.chorusDelayL.delayTime);
      this.chorusDepthR.connect(this.chorusDelayR.delayTime);
      try { this.chorusLfo.start(); } catch (e) {}

      if (this.ctx.createChannelMerger) {
        const merger = this.ctx.createChannelMerger(2);
        this.chorusDelayL.connect(merger, 0, 0);
        this.chorusDelayR.connect(merger, 0, 1);
        merger.connect(this.chorusWet);
      } else {
        this.chorusDelayL.connect(this.chorusWet);
        this.chorusDelayR.connect(this.chorusWet);
      }

      this.eqTreble.connect(this.chorusDry);
      this.eqTreble.connect(this.chorusDelayL);
      this.eqTreble.connect(this.chorusDelayR);

      // Studio brickwall limiter compressor to prevent digital clipping
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.15;
      this.chorusDry.connect(this.limiter);
      this.chorusWet.connect(this.limiter);
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
      // ping-pong delay
      this.delay = this.ctx.createDelay(2.0);
      this.delay.delayTime.value = 0.33; // 330ms default
      this.delayFb = this.ctx.createGain();
      this.delayFb.gain.value = 0.4;
      this.delayOut = this.ctx.createGain();
      this.delayOut.gain.value = 0.0; // OFF by default
      this.delay.connect(this.delayFb);
      this.delayFb.connect(this.delay);
      this.delay.connect(this.delayOut);
      this.delayOut.connect(this.master);
      this.delayOut.connect(this.reverb); // send delay tail to reverb
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

  setDelayGain(val) {
    if (this.delayOut && this.ctx) {
      const v = Math.max(0, Math.min(1.0, val));
      this.delayOut.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    }
  }

  setEq(bass, mid, treble) {
    if (bass !== undefined) this.eq.bass = Math.max(-12, Math.min(12, Number(bass)));
    if (mid !== undefined) this.eq.mid = Math.max(-12, Math.min(12, Number(mid)));
    if (treble !== undefined) this.eq.treble = Math.max(-12, Math.min(12, Number(treble)));
    if (this.ctx && this.eqBass) {
      const t = this.ctx.currentTime;
      this.eqBass.gain.setTargetAtTime(this.eq.bass, t, 0.03);
      this.eqMid.gain.setTargetAtTime(this.eq.mid, t, 0.03);
      this.eqTreble.gain.setTargetAtTime(this.eq.treble, t, 0.03);
    }
  }

  setChorus(wet, rate, depth) {
    if (wet !== undefined) this.chorus.wet = Math.max(0, Math.min(1, Number(wet)));
    if (rate !== undefined) this.chorus.rate = Math.max(0.1, Math.min(8, Number(rate)));
    if (depth !== undefined) this.chorus.depth = Math.max(0.0005, Math.min(0.01, Number(depth)));
    if (this.ctx && this.chorusWet) {
      const t = this.ctx.currentTime;
      this.chorusWet.gain.setTargetAtTime(this.chorus.wet, t, 0.03);
      if (this.chorusLfo) this.chorusLfo.frequency.setTargetAtTime(this.chorus.rate, t, 0.03);
      if (this.chorusDepthL) this.chorusDepthL.gain.setTargetAtTime(this.chorus.depth, t, 0.03);
      if (this.chorusDepthR) this.chorusDepthR.gain.setTargetAtTime(-this.chorus.depth, t, 0.03);
    }
  }

  getVisualizerData() {
    if (!this.analyser) return null;
    if (!this._visData) this._visData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this._visData);
    return this._visData;
  }

  /* ---- Persistent per-track buses -------------------------------------
     A bus owns a gain (volume) + panner (pan) + analyser (meter) and fans
     out to master, reverb and delay. Voices routed to a bus inherit its
     mixer settings, so moving a fader affects already-scheduled notes too
     and we get a free per-track level meter. */
  getBus(name) {
    const ctx = this.ensure();
    if (!this.buses[name]) {
      const gain = ctx.createGain();
      let out = gain;
      let panner = null;
      if (ctx.createStereoPanner) {
        panner = ctx.createStereoPanner();
        gain.connect(panner);
        out = panner;
      }
      out.connect(this.master);
      out.connect(this.reverb);
      out.connect(this.delay);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      out.connect(analyser);
      this.buses[name] = { gain, panner, analyser, _data: null };
    }
    return this.buses[name];
  }

  setBusGain(name, val) {
    const b = this.getBus(name);
    b.gain.gain.setTargetAtTime(Math.max(0, Math.min(2, val)), this.ctx.currentTime, 0.03);
  }

  setBusPan(name, val) {
    const b = this.getBus(name);
    if (b.panner) b.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, val)), this.ctx.currentTime, 0.03);
  }

  /* Peak level (0..1) of a bus, for the mixer meters. */
  getBusLevel(name) {
    const b = this.buses[name];
    if (!b) return 0;
    if (!b._data) b._data = new Uint8Array(b.analyser.frequencyBinCount);
    b.analyser.getByteTimeDomainData(b._data);
    let peak = 0;
    for (let i = 0; i < b._data.length; i++) {
      const d = Math.abs(b._data[i] - 128) / 128;
      if (d > peak) peak = d;
    }
    return peak;
  }

  /* Polyphony guard: cap concurrent voices so fast arps / dense chords can
     never build up an unbounded node graph. Oldest voices are stolen. */
  _registerVoice(voice, durSec) {
    if (!this.ctx) return;
    const t = performance.now();
    this._voices = this._voices.filter(v => v.exp > t);
    if (this._voices.length >= 64) {
      const old = this._voices.shift();
      try { if (old.voice && old.voice.stop) old.voice.stop(); } catch (e) {}
    }
    this._voices.push({ voice, exp: t + (Math.max(0.2, durSec) + 0.6) * 1000 });
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
    this.isRecording = true;
    return true;
  }

  stopLiveRecording() {
    return new Promise((resolve) => {
      if (!this._mediaRecorder || this._mediaRecorder.state !== 'recording') { this.isRecording = false; resolve(null); return; }
      this._mediaRecorder.onstop = () => {
        const dur = (performance.now() - this._recStartTime) / 1000;
        const blob = new Blob(this._recChunks, { type: this._mediaRecorder.mimeType || 'audio/webm' });
        this.isRecording = false;
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
  playNote(instDef, note, dur = 0, vel = 0.8, when = 0, opts = {}) {
    const ctx = this.ensure();
    this.guard();
    const t = when > 0 ? when : ctx.currentTime;
    let voice;
    if (opts.bus) {
      const bus = this.getBus(opts.bus);
      const o = Object.assign({}, opts);
      delete o.pan; // the bus owns panning
      voice = this.scheduleNote(ctx, bus.gain, null, instDef, note, dur, vel, t, o, null);
    } else {
      voice = this.scheduleNote(ctx, this.master, this.reverb, instDef, note, dur, vel, t, opts, this.delay);
    }
    this._registerVoice(voice, dur > 0 ? dur : 1.8);
    return voice;
  }

  /* Core synthesis — works on any BaseAudioContext (live or offline) */
  scheduleNote(ctx, master, reverb, instDef, note, dur = 0, vel = 0.8, when = 0, opts = {}, delayNode = null) {
    const t = when;
    const freq = typeof note === 'number' ? note : noteToFreq(note);
    const g = ctx.createGain();
    
    let outNode = g;
    if (opts.pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = opts.pan;
      g.connect(panner);
      outNode = panner;
    }
    
    outNode.connect(master);
    if (reverb) outNode.connect(reverb);
    if (delayNode) outNode.connect(delayNode);
    
    const a = instDef.adsr || { a: 0.01, d: 0.3, s: 0.5, r: 0.2 };
    const peak = vel * 0.5 * (opts.vol ?? 1.0);
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
      case 'santur': {
        // Physical modeling synthesis of Persian Santur (hammered dulcimer).
        // Authentic Santur features multiple strings per course struck by wooden mezrabs,
        // producing a distinct bright percussive hammer attack and shimmering chorus beating.
        const sr = ctx.sampleRate;
        const durSec = instDef.dur || 3.8;
        const total = Math.max(10, Math.floor(sr * durSec));
        const buf = ctx.createBuffer(1, total, sr);
        const out = buf.getChannelData(0);

        // Course detune ratios: central pitch + two slightly detuned unison strings (+2.8 cents, -2.5 cents)
        const detuneFactors = [1.0, Math.pow(2, 2.8 / 1200), Math.pow(2, -2.5 / 1200)];
        const damp = instDef.damping || 0.9975;

        for (let c = 0; c < detuneFactors.length; c++) {
          const f = freq * detuneFactors[c];
          const N = Math.max(2, Math.round(sr / f));
          const ring = new Float32Array(N);
          let lp = 0;
          // Mezrab hammer excitation: crisp bright strike transient with slight high-frequency presence
          for (let i = 0; i < N; i++) {
            const w = Math.random() * 2 - 1;
            lp += 0.75 * (w - lp);
            ring[i] = lp * (1 - (i / N) * 0.35);
          }
          // Mezrab click transient
          if (N > 8) {
            ring[0] += (c === 0 ? 0.7 : 0.35);
            ring[1] -= (c === 0 ? 0.35 : 0.18);
          }

          let ptr = 0;
          const courseGain = (c === 0 ? 0.44 : 0.28);
          for (let n = 0; n < total; n++) {
            const cur = ring[ptr];
            out[n] += cur * courseGain;
            const nxt = ring[(ptr + 1) % N];
            ring[ptr] = 0.5 * (cur + nxt) * damp;
            ptr = (ptr + 1) % N;
          }
        }

        // Smooth anti-click endpoints
        const fadeLen = Math.min(256, Math.floor(sr * 0.01));
        for (let i = 0; i < fadeLen; i++) {
          out[total - 1 - i] *= (i / fadeLen);
        }
        const attackFade = Math.min(48, Math.floor(sr * 0.001));
        for (let i = 0; i < attackFade; i++) {
          out[i] *= (i / attackFade);
        }

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
        return this.scheduleDrum(ctx, master, reverb, instDef, note, vel, t, opts);
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

  playDrum(instDef, padId, vel = 0.9, when = 0, opts = {}) {
    const ctx = this.ensure();
    this.guard();
    const t = when > 0 ? when : ctx.currentTime;
    let voice;
    if (opts.bus) {
      const bus = this.getBus(opts.bus);
      const o = Object.assign({}, opts);
      delete o.pan;
      voice = this.scheduleDrum(ctx, bus.gain, null, instDef, padId, vel, t, o, null);
    } else {
      voice = this.scheduleDrum(ctx, this.master, this.reverb, instDef, padId, vel, t, opts, this.delay);
    }
    this._registerVoice(voice, 1.0);
    return voice;
  }

  scheduleDrum(ctx, master, reverb, instDef, padId, vel, when, opts = {}, delayNode = null) {
    const t = when;
    const g = ctx.createGain();
    
    let outNode = g;
    if (opts.pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = opts.pan;
      g.connect(panner);
      outNode = panner;
    }
    
    outNode.connect(master);
    if (reverb) outNode.connect(reverb);
    if (delayNode) outNode.connect(delayNode);
    
    vel = vel * (opts.vol ?? 1.0);
    
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
        o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.12);
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
      // Tonbak (Persian Goblet Drum) synthesis
      case 'tonbak-tom': {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(88, t);
        o.frequency.exponentialRampToValueAtTime(54, t + 0.22);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 220;
        g.gain.setValueAtTime(vel * 1.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        o.connect(f); f.connect(g);
        o.start(t); o.stop(t + 0.45);
        break;
      }
      case 'tonbak-bak': {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(280, t);
        o.frequency.exponentialRampToValueAtTime(195, t + 0.12);
        const og = ctx.createGain();
        og.gain.setValueAtTime(vel * 0.75, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 0.24);

        const n = noise(0.04);
        const nf = ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = 2400;
        nf.Q.value = 2.5;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(vel * 0.45, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        n.connect(nf); nf.connect(ng); ng.connect(g);
        n.start(t);
        break;
      }
      case 'tonbak-pelang': {
        const n = noise(0.08);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 3200;
        f.Q.value = 3.0;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(vel * 0.9, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        n.connect(f); f.connect(ng); ng.connect(g);
        n.start(t);

        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(460, t);
        o.frequency.exponentialRampToValueAtTime(300, t + 0.05);
        const og = ctx.createGain();
        og.gain.setValueAtTime(vel * 0.4, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 0.07);
        break;
      }
      case 'tonbak-riz': {
        [0, 0.032, 0.064].forEach((offset, idx) => {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.setValueAtTime(240, t + offset);
          o.frequency.exponentialRampToValueAtTime(180, t + offset + 0.04);
          const og = ctx.createGain();
          const subVel = vel * (idx === 0 ? 0.45 : idx === 1 ? 0.6 : 0.5);
          og.gain.setValueAtTime(subVel, t + offset);
          og.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.06);
          o.connect(og); og.connect(g);
          o.start(t + offset); o.stop(t + offset + 0.07);

          const n = noise(0.03);
          const nf = ctx.createBiquadFilter();
          nf.type = 'bandpass';
          nf.frequency.value = 2200;
          const ng = ctx.createGain();
          ng.gain.setValueAtTime(subVel * 0.35, t + offset);
          ng.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.03);
          n.connect(nf); nf.connect(ng); ng.connect(g);
          n.start(t + offset);
        });
        break;
      }
      case 'tonbak-kenar': {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(175, t);
        o.frequency.exponentialRampToValueAtTime(125, t + 0.18);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 450;
        g.gain.setValueAtTime(vel * 0.85, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(f); f.connect(g);
        o.start(t); o.stop(t + 0.28);
        break;
      }
      case 'tonbak-choub': {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(1100, t);
        o.frequency.exponentialRampToValueAtTime(750, t + 0.04);
        const og = ctx.createGain();
        og.gain.setValueAtTime(vel * 0.7, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 0.06);

        const n = noise(0.03);
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 3500;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(vel * 0.5, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        n.connect(f); f.connect(ng); ng.connect(g);
        n.start(t);
        break;
      }
    }
    return { stop: () => {} };
  }
}

if (typeof window !== 'undefined') {
  window.TonoraAudio = new AudioEngine();
  window.noteToFreq = noteToFreq;
}

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
if (typeof window !== 'undefined') {
  window.armAudioRevive = armAudioRevive;
}


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

  // 3-Band EQ & Chorus offline mirroring
  const eqBassVal = (typeof localStorage !== 'undefined') ? localStorage.getItem('tonora-eq-bass') : null;
  const eqMidVal = (typeof localStorage !== 'undefined') ? localStorage.getItem('tonora-eq-mid') : null;
  const eqTrebleVal = (typeof localStorage !== 'undefined') ? localStorage.getItem('tonora-eq-treble') : null;
  const chorusWetVal = (typeof localStorage !== 'undefined') ? localStorage.getItem('tonora-chorus') : null;

  const eqBass = off.createBiquadFilter();
  eqBass.type = 'lowshelf';
  eqBass.frequency.value = 100;
  eqBass.gain.value = eqBassVal !== null ? +eqBassVal : 0;

  const eqMid = off.createBiquadFilter();
  eqMid.type = 'peaking';
  eqMid.frequency.value = 1000;
  eqMid.Q.value = 1.0;
  eqMid.gain.value = eqMidVal !== null ? +eqMidVal : 0;

  const eqTreble = off.createBiquadFilter();
  eqTreble.type = 'highshelf';
  eqTreble.frequency.value = 3200;
  eqTreble.gain.value = eqTrebleVal !== null ? +eqTrebleVal : 0;

  master.connect(eqBass);
  eqBass.connect(eqMid);
  eqMid.connect(eqTreble);

  const limiter = off.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;

  const cWet = chorusWetVal !== null ? +chorusWetVal : 0;
  if (cWet > 0) {
    const chorusDry = off.createGain();
    chorusDry.gain.value = 1.0;
    const chorusWet = off.createGain();
    chorusWet.gain.value = cWet;
    const delayL = off.createDelay(0.1);
    const delayR = off.createDelay(0.1);
    delayL.delayTime.value = 0.020;
    delayR.delayTime.value = 0.022;
    const lfo = off.createOscillator();
    lfo.frequency.value = 1.5;
    const depthL = off.createGain(); depthL.gain.value = 0.002;
    const depthR = off.createGain(); depthR.gain.value = -0.002;
    lfo.connect(depthL); depthL.connect(delayL.delayTime);
    lfo.connect(depthR); depthR.connect(delayR.delayTime);
    try { lfo.start(0); } catch (e) {}
    eqTreble.connect(chorusDry);
    eqTreble.connect(delayL);
    eqTreble.connect(delayR);
    if (off.createChannelMerger) {
      const merger = off.createChannelMerger(2);
      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      merger.connect(chorusWet);
    } else {
      delayL.connect(chorusWet);
      delayR.connect(chorusWet);
    }
    chorusDry.connect(limiter);
    chorusWet.connect(limiter);
  } else {
    eqTreble.connect(limiter);
  }
  limiter.connect(off.destination);
  const reverb = off.createConvolver();
  reverb.buffer = makeReverbBuffer(off);
  const rg = off.createGain();
  // match global settings if defined, else fallback
  const globalRev = localStorage.getItem('tonora-reverb');
  rg.gain.value = globalRev !== null ? +globalRev : 0.18;
  reverb.connect(rg); rg.connect(master);
  
  const delay = off.createDelay(2.0);
  delay.delayTime.value = 0.33;
  const delayFb = off.createGain();
  delayFb.gain.value = 0.4;
  const delayOut = off.createGain();
  const globalDel = localStorage.getItem('tonora-delay');
  delayOut.gain.value = globalDel !== null ? +globalDel : 0.0;
  delay.connect(delayFb); delayFb.connect(delay);
  delay.connect(delayOut); delayOut.connect(master); delayOut.connect(reverb);
  const eng = window.TonoraAudio;
  const inst = id => window.TONORA_INSTRUMENTS.find(i => i.id === id);
  const baseVel = (tracks.velocity !== undefined) ? tracks.velocity : 0.8;
  const stepVel = (s) => {
    const v = tracks.stepVel && tracks.stepVel[s];
    return (v && v > 0) ? v : baseVel;
  };
  const noteLen = (track, s) => {
    const a = tracks.noteLen && tracks.noteLen[track];
    const v = a && a[s];
    return (v && v > 0) ? Math.min(8, v) : 2;
  };
  const cellHits = (cell, s, track) => {
    if (!cell) return [];
    if (typeof cell === 'string') return [{ n: cell, len: noteLen(track, s) }];
    if (cell && typeof cell === 'object' && !Array.isArray(cell)) return [{ n: cell.n, len: noteLen(track, s) }];
    if (Array.isArray(cell)) return cell.map(x => ({ n: (x && typeof x === 'object') ? x.n : x, len: noteLen(track, s) })).filter(h => h.n);
    return [];
  };

  // offline buses mirroring the live mixer (gain + pan), so the render
  // reflects the same volume/pan settings the user hears in the app
  const buses = {};
  const mkBus = (id) => {
    const mix = (tracks.mixer && tracks.mixer[id]) || { vol: 1, pan: 0 };
    const gain = off.createGain();
    gain.gain.value = mix.vol;
    let out = gain;
    if (off.createStereoPanner) {
      const p = off.createStereoPanner();
      p.pan.value = mix.pan || 0;
      gain.connect(p);
      out = p;
    }
    out.connect(master);
    out.connect(reverb);
    out.connect(delay);
    buses[id] = gain;
  };
  mkBus('melody'); mkBus('bass'); mkBus('drums');

  const soloed = tracks.solo && Object.values(tracks.solo).some(Boolean);
  const audible = (track) => soloed ? !!tracks.solo[track] : !(tracks.muted && tracks.muted[track]);

  let currentWhen = 0;
  for (let s = 0; s < steps; s++) {
    const when = currentWhen;
    let dur = baseDur;
    if (swing) dur *= (s % 2 === 0) ? 1.33 : 0.67;
    currentWhen += dur;

    const vel = stepVel(s);
    const mel = tracks.melody[s];
    if (mel && audible('melody')) {
      cellHits(mel, s, 'melody').forEach(h => eng.scheduleNote(off, buses.melody, null, inst('piano'), h.n, dur * h.len, vel, when, {}, null));
    }
    const bass = tracks.bass[s];
    if (bass && audible('bass')) {
      cellHits(bass, s, 'bass').forEach(h => eng.scheduleNote(off, buses.bass, null, inst('synth'), h.n, dur * h.len + dur, vel, when, {}, null));
    }

    // Check old style single drum array, or new style dict
    if (audible('drums')) {
      if (tracks.drums[s] === true) {
        eng.scheduleDrum(off, buses.drums, null, inst('drums'), s % 8 === 0 ? 'kick' : (s % 4 === 2 ? 'snare' : 'hat'), vel, when, {}, null);
      } else if (typeof tracks.drums === 'object' && !Array.isArray(tracks.drums)) {
        if (tracks.drums.kick && tracks.drums.kick[s]) eng.scheduleDrum(off, buses.drums, null, inst('drums'), 'kick', vel, when, {}, null);
        if (tracks.drums.snare && tracks.drums.snare[s]) eng.scheduleDrum(off, buses.drums, null, inst('drums'), 'snare', vel, when, {}, null);
        if (tracks.drums.hat && tracks.drums.hat[s]) eng.scheduleDrum(off, buses.drums, null, inst('drums'), 'hat', vel, when, {}, null);
      }
    }
  }
  const rendered = await off.startRendering();
  return audioBufferToWav(rendered);
}
if (typeof window !== 'undefined') {
  window.renderCompositionToWav = renderCompositionToWav;
}

/* Expose pure helpers for Node-based unit tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { noteToFreq, NOTE_OFFSET, audioBufferToWav };
}

