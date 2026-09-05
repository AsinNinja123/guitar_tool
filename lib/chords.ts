import guitarDb from '@tombatossals/chords-db/lib/guitar.json';

export type ChordPosition = {
  frets: number[];
  baseFret: number;
  barres: number[];
  capo?: boolean;
};

export type ChordDefinition = {
  key: string;
  suffix: string;
  positions: ChordPosition[];
};

type GuitarDatabase = {
  main: { numberOfChords: number };
  keys: string[];
  suffixes: string[];
  chords: Record<string, ChordDefinition[]>;
};

const database = guitarDb as GuitarDatabase;

export const CHORD_KEYS = database.keys;
export const CHORD_SUFFIXES = database.suffixes;
export const CHORD_VOICING_COUNT = database.main.numberOfChords;

const SUFFIX_LABELS: Record<string, string> = {
  major: 'Major', minor: 'Minor', dim: 'Diminished', dim7: 'Diminished 7',
  sus2: 'Suspended 2', sus4: 'Suspended 4', '7sus4': '7 sus 4', '7sg': '7 (no 5th)',
  alt: 'Altered', aug: 'Augmented', '6': '6', '69': '6/9', '7': 'Dominant 7',
  '7b5': '7 flat 5', aug7: 'Augmented 7', '9': '9', '9b5': '9 flat 5',
  aug9: 'Augmented 9', '7b9': '7 flat 9', '7#9': '7 sharp 9', '11': '11',
  '9#11': '9 sharp 11', '13': '13', maj7: 'Major 7', maj7b5: 'Major 7 flat 5',
  'maj7#5': 'Major 7 sharp 5', maj9: 'Major 9', maj11: 'Major 11', maj13: 'Major 13',
  m6: 'Minor 6', m69: 'Minor 6/9', m7: 'Minor 7', m7b5: 'Minor 7 flat 5',
  m9: 'Minor 9', m11: 'Minor 11', mmaj7: 'Minor major 7', mmaj7b5: 'Minor major 7 flat 5',
  mmaj9: 'Minor major 9', mmaj11: 'Minor major 11', add9: 'Add 9', madd9: 'Minor add 9',
};

export function suffixLabel(suffix: string) {
  return SUFFIX_LABELS[suffix] || suffix.replace('/', ' over ');
}

export function chordDisplayName(key: string, suffix: string) {
  if (suffix === 'major') return key;
  if (suffix === 'minor') return `${key}m`;
  return `${key}${suffix}`;
}

/* chords-db lists its keys as "C#" and "F#" but files those two chord sets
   under "Csharp" and "Fsharp". Everything must go through this. */
const KEY_TO_STORE: Record<string, string> = { 'C#': 'Csharp', 'F#': 'Fsharp' };

export function chordsForKey(key: string) {
  return database.chords[KEY_TO_STORE[key] || key] || [];
}

export function findChord(key: string, suffix: string) {
  return chordsForKey(key).find(chord => chord.suffix === suffix) || null;
}

export function normalizeChordSearch(query: string) {
  return query.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '').toLowerCase();
}

export function searchChords(query: string, limit = 24) {
  const needle = normalizeChordSearch(query);
  const all = CHORD_KEYS.flatMap(key => chordsForKey(key).map(chord => ({
    ...chord,
    name: chordDisplayName(key, chord.suffix),
    label: `${key} ${suffixLabel(chord.suffix)}`,
  })));
  if (!needle) return all.filter(chord => ['major', 'minor', '7', 'maj7', 'm7', 'sus2', 'sus4', 'add9'].includes(chord.suffix)).slice(0, limit);
  return all.filter(chord => normalizeChordSearch(`${chord.name} ${chord.label}`).includes(needle)).slice(0, limit);
}

/* ── Quick chord lookup ─────────────────────────────────────────────
   Type a chord name, get the few easiest ways to play it — no hunting
   through every voicing in the database. */

const DB_KEYS = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];

const SUFFIX_ALIASES: Record<string, string> = {
  '': 'major', 'maj': 'major', 'M': 'major', 'major': 'major',
  'm': 'minor', 'min': 'minor', '-': 'minor', 'minor': 'minor',
  'm7': 'm7', 'min7': 'm7', '-7': 'm7',
  'maj7': 'maj7', 'M7': 'maj7', 'ma7': 'maj7',
  '7': '7', 'dom7': '7', '9': '9', '11': '11', '13': '13', '6': '6', '69': '69',
  'sus': 'sus4', 'sus2': 'sus2', 'sus4': 'sus4', '7sus4': '7sus4',
  'add9': 'add9', 'madd9': 'madd9', 'm6': 'm6', 'm9': 'm9', 'm11': 'm11',
  'dim': 'dim', 'dim7': 'dim7', 'o': 'dim', 'o7': 'dim7',
  'aug': 'aug', '+': 'aug', 'aug7': 'aug7', '7b5': '7b5', 'm7b5': 'm7b5',
  'maj9': 'maj9', 'maj11': 'maj11', 'maj13': 'maj13', 'mmaj7': 'mmaj7',
  '7b9': '7b9', '7#9': '7#9', '9b5': '9b5', '9#11': '9#11', 'alt': 'alt',
};

/** Turn a written suffix ("m7", "MAJ7", "sus") into a chords-db suffix. */
export function dbSuffix(raw: string) {
  const cleaned = raw.replace(/♯/g, '#').replace(/♭/g, 'b').trim();
  if (SUFFIX_ALIASES[cleaned] !== undefined) return SUFFIX_ALIASES[cleaned];
  const lower = cleaned.toLowerCase();
  if (SUFFIX_ALIASES[lower] !== undefined) return SUFFIX_ALIASES[lower];
  if (CHORD_SUFFIXES.includes(cleaned)) return cleaned;
  if (CHORD_SUFFIXES.includes(lower)) return lower;
  const withM = lower.replace(/^min/, 'm');
  if (CHORD_SUFFIXES.includes(withM)) return withM;
  return null;
}

export function dbKeyFromPitch(pitchClass: number) {
  return DB_KEYS[((pitchClass % 12) + 12) % 12];
}

/** How awkward is this shape? Lower is easier. Open shapes win. */
export function positionDifficulty(position: ChordPosition) {
  const muted = position.frets.filter(fret => fret < 0).length;
  const open = position.frets.filter(fret => fret === 0).length;
  const fretted = position.frets.filter(fret => fret > 0);
  const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
  return (position.baseFret - 1) * 1.6
    + position.barres.length * 3
    + muted * 0.9
    - open * 1.3
    + span * 1.1;
}

export type ChordLookup = {
  name: string;
  key: string;
  suffix: string;
  label: string;
  positions: ChordPosition[];
  total: number;
};

/**
 * Parse free text like "F#m7" or "Bb add9" and return the easiest voicings.
 * Returns null when the text is not a chord name.
 */
export function lookupChord(query: string, count = 3): ChordLookup | null {
  const cleaned = query.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');
  const match = cleaned.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return null;
  const key = (match[1].toUpperCase() + match[2]) as string;
  const normalizedKey = key === 'Db' ? 'C#' : key === 'D#' ? 'Eb' : key === 'Gb' ? 'F#'
    : key === 'G#' ? 'Ab' : key === 'A#' ? 'Bb' : key === 'Cb' ? 'B' : key === 'Fb' ? 'E'
    : key === 'E#' ? 'F' : key === 'B#' ? 'C' : key;
  if (!CHORD_KEYS.includes(normalizedKey)) return null;
  const suffix = dbSuffix(match[3] || '');
  if (!suffix) return null;
  const chord = findChord(normalizedKey, suffix);
  if (!chord) return null;
  const ranked = [...chord.positions].sort((a, b) => positionDifficulty(a) - positionDifficulty(b));
  return {
    name: chordDisplayName(normalizedKey, suffix),
    key: normalizedKey,
    suffix,
    label: suffixLabel(suffix),
    positions: ranked.slice(0, count),
    total: chord.positions.length,
  };
}

/** Easiest-first voicings for a key/suffix already chosen in the library. */
export function easiestFirst(positions: ChordPosition[]) {
  return [...positions].sort((a, b) => positionDifficulty(a) - positionDifficulty(b));
}
