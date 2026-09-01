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

export function findChord(key: string, suffix: string) {
  return database.chords[key]?.find(chord => chord.suffix === suffix) || null;
}

export function normalizeChordSearch(query: string) {
  return query.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '').toLowerCase();
}

export function searchChords(query: string, limit = 24) {
  const needle = normalizeChordSearch(query);
  const all = CHORD_KEYS.flatMap(key => (database.chords[key] || []).map(chord => ({
    ...chord,
    name: chordDisplayName(key, chord.suffix),
    label: `${key} ${suffixLabel(chord.suffix)}`,
  })));
  if (!needle) return all.filter(chord => ['major', 'minor', '7', 'maj7', 'm7', 'sus2', 'sus4', 'add9'].includes(chord.suffix)).slice(0, limit);
  return all.filter(chord => normalizeChordSearch(`${chord.name} ${chord.label}`).includes(needle)).slice(0, limit);
}
