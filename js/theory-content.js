/* Tonora — Music-theory curriculum + a pure answer-checker.
   Uses Tonal (window.Tonal in the browser, the npm package under Node) to
   derive scales/chords/intervals, with a self-contained fallback so the
   curriculum still works offline. Emits note names only (no DOM). */
'use strict';

function getTonal() {
  if (typeof window !== 'undefined' && window.Tonal) return window.Tonal;
  if (typeof module !== 'undefined' && module.exports) {
    try { return require('tonal'); } catch (e) { /* fall through */ }
  }
  return null;
}
// NOTE: must not be named `Tonal` — the tonal CDN bundle declares a global
// `var Tonal`, and a top-level `const Tonal` here would throw
// "Identifier 'Tonal' has already been declared", killing this whole file.
const TONAL = getTonal();

const SEMIS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const INTERVAL_SEMIS = { '1P': 0, '2m': 1, '2M': 2, '3m': 3, '3M': 4, '4P': 5, '5d': 6, '5P': 7, '6m': 8, '6M': 9, '7m': 10, '7M': 11, '8P': 12 };
const CHORD_IVS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus4: [0, 5, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10] };

function parsePc(note) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(note || '');
  if (!m) return null;
  const pc = (((BASE[m[1][0]] + (m[1][1] === '#' ? 1 : m[1][1] === 'b' ? -1 : 0)) % 12) + 12) % 12;
  return { pc, oct: parseInt(m[2], 10) };
}

function midiOf(pc, oct) {
  const p = parsePc(pc + oct);
  return p ? p.pc + (p.oct + 1) * 12 : null;
}

/* Given pitch classes, assign octaves so the line ascends from startOctave. */
function assignOctaves(pcs, startOctave) {
  let oct = startOctave == null ? 4 : startOctave;
  let prev = -Infinity;
  return pcs.map(pc => {
    let midi = midiOf(pc, oct);
    while (midi != null && midi <= prev) { oct++; midi = midiOf(pc, oct); }
    prev = midi;
    return pc + oct;
  });
}

function noteTranspose(root, interval) {
  if (TONAL && TONAL.Note) return TONAL.Note.transpose(root, interval);
  const p = parsePc(root);
  const semis = INTERVAL_SEMIS[interval];
  if (!p || semis == null) return root;
  return assignOctaves([SEMIS[(p.pc + semis) % 12]], p.oct)[0];
}

function chordNotes(root, quality) {
  const p = parsePc(root);
  if (!p) return [];
  let pcs = null;
  if (TONAL && TONAL.Chord) {
    const alias = { maj: 'maj', min: 'min', dim: 'dim', aug: 'aug', sus4: 'sus4', maj7: 'maj7', min7: 'm7', dom7: '7' }[quality];
    if (alias) {
      const ch = TONAL.Chord.get(root.replace(/\d/, '') + alias);
      if (ch && ch.notes && ch.notes.length) pcs = ch.notes;
    }
  }
  if (!pcs) pcs = (CHORD_IVS[quality] || CHORD_IVS.maj).map(s => SEMIS[(p.pc + s) % 12]);
  return assignOctaves(pcs, p.oct);
}

function scaleNotes(scale, octave) {
  let pcs = null;
  if (TONAL && TONAL.Scale) {
    const s = TONAL.Scale.get(scale);
    if (s && s.notes && s.notes.length) pcs = s.notes;
  }
  if (!pcs) {
    const rootName = (scale || 'C').split(' ')[0];
    const rp = parsePc(rootName + '1');
    pcs = [0, 2, 4, 5, 7, 9, 11].map(s => SEMIS[((rp ? rp.pc : 0) + s) % 12]);
  }
  return assignOctaves(pcs, octave == null ? 4 : octave);
}

function intervalLabel(interval) {
  const labels = { '1P': 'Unison', '2m': 'Minor 2nd', '2M': 'Major 2nd', '3m': 'Minor 3rd', '3M': 'Major 3rd', '4P': 'Perfect 4th', '5P': 'Perfect 5th', '6m': 'Minor 6th', '6M': 'Major 6th', '7M': 'Major 7th', '8P': 'Octave' };
  return labels[interval] || interval;
}

const THEORY_LESSONS = [
  {
    id: 'note-names',
    title: { en: 'Note Names', fa: 'نام نت‌ها' },
    blurb: { en: 'The seven white keys repeat: C D E F G A B.', fa: 'هفت کلید سفید تکرار می‌شوند: C D E F G A B.' },
    type: 'note',
    pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']
  },
  {
    id: 'sharps',
    title: { en: 'Sharps & Flats', fa: 'دیز و بمل' },
    blurb: { en: 'Black keys raise or lower a note by one semitone.', fa: 'کلیدهای سیاه یک نیم‌پرده بالا یا پایین می‌برند.' },
    type: 'note',
    pool: ['C#4', 'D#4', 'F#4', 'G#4', 'A#4']
  },
  {
    id: 'intervals',
    title: { en: 'Intervals', fa: 'فواصل' },
    blurb: { en: 'Play the note at the given interval above C.', fa: 'نت را در فاصلهٔ داده‌شده بالای دو بنواز.' },
    type: 'interval',
    root: 'C4',
    intervals: ['2M', '3M', '4P', '5P', '6M', '8P']
  },
  {
    id: 'major-triad',
    title: { en: 'Major Triad', fa: 'آکورد ماژور' },
    blurb: { en: 'A major triad is root + major third + perfect fifth.', fa: 'آکورد ماژور = پایه + سوم بزرگ + پنجم درست.' },
    type: 'chord',
    roots: ['C4', 'G3', 'D4', 'A3', 'F3'],
    quality: 'maj'
  },
  {
    id: 'minor-triad',
    title: { en: 'Minor Triad', fa: 'آکورد مینور' },
    blurb: { en: 'A minor triad lowers the third by a semitone.', fa: 'آکورد مینور سوم را یک نیم‌پرده پایین می‌آورد.' },
    type: 'chord',
    roots: ['A3', 'D4', 'E3', 'B3'],
    quality: 'min'
  },
  {
    id: 'scale-c',
    title: { en: 'C Major Scale', fa: 'گام دو ماژور' },
    blurb: { en: 'Play the seven notes of the C major scale in order.', fa: 'هفت نت گام دو ماژور را به ترتیب بنواز.' },
    type: 'scale',
    scale: 'C major',
    octave: 3
  },
  {
    id: 'scale-g',
    title: { en: 'G Major Scale', fa: 'گام سل ماژور' },
    blurb: { en: 'G major has one sharp (F#).', fa: 'گام سل ماژور یک دیز دارد (F#).' },
    type: 'scale',
    scale: 'G major',
    octave: 3
  },
  {
    id: 'ear-intervals',
    title: { en: 'Ear: Intervals', fa: 'گوش: فاصله‌ها' },
    blurb: { en: 'Listen to two notes and name the distance between them.', fa: 'به دو نت گوش کن و فاصلهٔ بین آن‌ها را نام ببر.' },
    type: 'ear',
    kind: 'interval',
    roots: ['C4', 'G4', 'F4', 'A4'],
    pool: ['2M', '3M', '4P', '5P', '6M', '8P']
  },
  {
    id: 'ear-chords',
    title: { en: 'Ear: Triads', fa: 'گوش: سه‌صداها' },
    blurb: { en: 'Major sounds bright, minor sounds dark.', fa: 'صدای ماژور درخشان و صدای مینور تاریک و غمگین است.' },
    type: 'ear',
    kind: 'chord',
    roots: ['C4', 'A3', 'F3', 'G3'],
    pool: ['maj', 'min']
  }
];

/* Expected note sequence for a question. `q` is the concrete question:
   a note name (type 'note'), {interval} (type 'interval'), {root} (type 'chord'),
   or undefined (type 'scale'). */
function expectedFor(lesson, q) {
  if (!lesson) return [];
  if (lesson.type === 'note') return [q];
  if (lesson.type === 'interval') return [noteTranspose(lesson.root, q.interval)];
  if (lesson.type === 'chord') return chordNotes(q.root, lesson.quality);
  if (lesson.type === 'scale') return scaleNotes(lesson.scale, lesson.octave);
  if (lesson.type === 'ear') {
    const root = (q && q.root) || lesson.roots[0] || lesson.root || 'C4';
    if (lesson.kind === 'chord') return chordNotes(root, q.choice);
    return [root, noteTranspose(root, q.choice)];
  }
  return [];
}

/* Validate a set of played notes against the expected answer. */
function validateAnswer(lesson, question, played) {
  const expected = expectedFor(lesson, question);
  const expSet = new Set(expected);
  const pl = played || [];
  const missing = expected.filter(n => !pl.includes(n));
  const extra = pl.filter(n => !expSet.has(n));
  const correct = expected.length > 0 && missing.length === 0 && extra.length === 0;
  return { correct, expected, missing, extra };
}

if (typeof window !== 'undefined') {
  window.TonoraTheory = { THEORY_LESSONS, expectedFor, validateAnswer, chordNotes, scaleNotes, noteTranspose, intervalLabel, assignOctaves };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { THEORY_LESSONS, expectedFor, validateAnswer, chordNotes, scaleNotes, noteTranspose, intervalLabel, assignOctaves };
}
