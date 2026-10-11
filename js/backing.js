/* Tonora — backing-track generator for Learn mode.
   Pure logic (no Web Audio) so it can be unit-tested in Node.
   Infers a major key from a song's notes and emits a simple I–IV–V style
   accompaniment (root + triad per bar). Tonal.js is used when present for
   key spelling, otherwise an internal table is used. */
'use strict';

const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
// major-scale diatonic degrees: [semitone offset, triad intervals, quality]
const DEGREES = [
  { off: 0, third: 4, fifth: 7 },   // I  major
  { off: 2, third: 3, fifth: 7 },   // ii minor
  { off: 4, third: 3, fifth: 7 },   // iii minor
  { off: 5, third: 4, fifth: 7 },   // IV major
  { off: 7, third: 4, fifth: 7 },   // V  major
  { off: 9, third: 3, fifth: 7 },   // vi minor
  { off: 11, third: 3, fifth: 6 }   // vii dim
];

function pcOf(note) {
  const m = /^([A-G][#b]?)/.exec(note || '');
  return m && PC[m[1]] !== undefined ? PC[m[1]] : null;
}

function scalePcs(rootPc) {
  const s = new Set();
  MAJOR_STEPS.forEach(step => s.add((rootPc + step) % 12));
  return s;
}

/* Pick the major key (0..11) that best contains the given pitch classes. */
function inferKeyRoot(pcs) {
  let best = 0, bestScore = -1;
  for (let r = 0; r < 12; r++) {
    const scale = scalePcs(r);
    let score = 0;
    pcs.forEach(pc => { if (pc != null && scale.has(pc)) score++; });
    // tie-break toward C, then lower roots
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

/* Choose the diatonic triad that best matches a bar's pitch classes. */
function bestDegree(keyRoot, barPcs) {
  let best = DEGREES[0], bestScore = -1;
  DEGREES.forEach(d => {
    const root = (keyRoot + d.off) % 12;
    const triad = [root, (root + d.third) % 12, (root + d.fifth) % 12];
    let score = 0;
    barPcs.forEach(pc => { if (triad.includes(pc)) score += 2; });
    if (barPcs.includes(root)) score += 1; // root presence bonus
    if (score > bestScore) { bestScore = score; best = { d, root, triad }; }
  });
  return best;
}

/* Build per-bar accompaniment. Notes are the song's {n,t,d} events. */
function buildBacking(song, beatsPerBar) {
  beatsPerBar = beatsPerBar || 4;
  const notes = (song && song.notes) || [];
  if (!notes.length) return { key: 0, bars: [] };
  const pcs = notes.map(n => pcOf(n.n));
  const keyRoot = inferKeyRoot(pcs);
  const last = notes[notes.length - 1];
  const totalBeats = Math.ceil((last.t + last.d) / beatsPerBar) * beatsPerBar;
  const bars = [];
  for (let start = 0; start < totalBeats; start += beatsPerBar) {
    const end = start + beatsPerBar;
    const barPcs = notes.filter(n => n.t >= start && n.t < end).map(n => pcOf(n.n)).filter(x => x != null);
    const best = bestDegree(keyRoot, barPcs);
    bars.push({
      startBeat: start,
      rootPc: best.root,
      triad: best.triad.slice(),
      quality: best.d.third === 4 ? 'maj' : (best.d.fifth === 6 ? 'dim' : 'min'),
      label: NAMES[best.root]
    });
  }
  return { key: keyRoot, keyName: NAMES[keyRoot], bars };
}

/* Convert a pitch class to a note name at the given octave. */
function pcToNote(pc, octave) {
  return NAMES[((pc % 12) + 12) % 12] + octave;
}

if (typeof window !== 'undefined') window.TonoraBacking = { buildBacking, pcToNote, inferKeyRoot, pcOf };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildBacking, pcToNote, inferKeyRoot, pcOf, bestDegree };
}
