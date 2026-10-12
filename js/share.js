/* Tonora — URL-share encode/decode for compositions.
   Packs {bpm, steps, tracks} into a compact JSON → UTF-8 → base64url in #s=...  */
'use strict';

const TonoraShare = {
  /* notes can be large; strip whitespace, keep short keys */
  _pack(tracks, bpm, steps) {
    const slim = {
      b: bpm, s: steps,
      m: tracks.melody || [],
      bs: tracks.bass || [],
      d: tracks.drums || {},
      v: tracks.velocity !== undefined ? tracks.velocity : undefined,
      mx: tracks.mixer || undefined,
      sv: tracks.stepVel || undefined,
      nl: tracks.noteLen || undefined
    };
    if (slim.v === undefined) delete slim.v;
    if (slim.mx === undefined) delete slim.mx;
    if (slim.sv === undefined) delete slim.sv;
    if (slim.nl === undefined) delete slim.nl;
    return slim;
  },
  _unpack(o) {
    return {
      bpm: o.b || 120,
      steps: o.s || 32,
      tracks: {
        melody: o.m || [],
        bass: o.bs || [],
        drums: o.d || {},
        mixer: o.mx,
        velocity: o.v,
        stepVel: o.sv,
        noteLen: o.nl
      }
    };
  },

  encode(tracks, bpm, steps) {
    const o = this._pack(tracks, bpm, steps);
    const json = JSON.stringify(o);
    const utf8 = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(json) : json;
    let bin = '';
    utf8.forEach(b => bin += String.fromCharCode(b));
    const b64 = (typeof btoa !== 'undefined') ? btoa(bin) : Buffer.from(json, 'utf8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },

  decode(str) {
    try {
      const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
      const pad = '='.repeat((4 - b64.length % 4) % 4);
      const bin = (typeof atob !== 'undefined') ? atob(b64 + pad) : Buffer.from(b64 + pad, 'base64').toString('binary');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const json = (typeof TextDecoder !== 'undefined') ? new TextDecoder().decode(bytes) : String.fromCharCode(...bytes);
      return this._unpack(JSON.parse(json));
    } catch (e) { return null; }
  }
};

if (typeof window !== 'undefined') window.TonoraShare = TonoraShare;
if (typeof module !== 'undefined' && module.exports) module.exports = TonoraShare;
