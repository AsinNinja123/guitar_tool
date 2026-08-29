export const SHARP_NOTES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export const FLAT_NOTES = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
export const KEY_OPTIONS = [
  { value: 0, label: 'C' }, { value: 1, label: 'D♭' }, { value: 2, label: 'D' },
  { value: 3, label: 'E♭' }, { value: 4, label: 'E' }, { value: 5, label: 'F' },
  { value: 6, label: 'F♯' }, { value: 7, label: 'G' }, { value: 8, label: 'A♭' },
  { value: 9, label: 'A' }, { value: 10, label: 'B♭' }, { value: 11, label: 'B' },
];

const ROOT_MAP: Record<string, number> = {
  C:0,'B#':0,'C#':1,DB:1,D:2,'D#':3,EB:3,E:4,FB:4,'E#':5,F:5,
  'F#':6,GB:6,G:7,'G#':8,AB:8,A:9,'A#':10,BB:10,B:11,CB:11,
};
const FLAT_KEYS = new Set([0,1,3,5,8,10]);
const MAJOR_SCALE = [0,2,4,5,7,9,11];
const MINOR_SCALE = [0,2,3,5,7,8,10];

export type ParsedChord = { raw:string; root:number; suffix:string; minor:boolean; diminished:boolean };
export type KeyGuess = { root:number; mode:'major'|'minor'; score:number; confidence:number; roman:string[] };
export type CapoOption = { capo:number; shapeRoot:number; shapeKey:string; chords:string[]; score:number; reason:string };

export function prettyNote(pc:number, preferFlats=true) {
  const safe = ((pc % 12) + 12) % 12;
  return (preferFlats ? FLAT_NOTES : SHARP_NOTES)[safe];
}

export function parseChord(token:string): ParsedChord | null {
  const cleaned = token.trim().replace(/[|,()[\]]/g, '');
  const match = cleaned.match(/^([A-Ga-g])([#♯b♭]?)(.*)$/);
  if (!match) return null;
  const accidental = match[2].replace('♯','#').replace('♭','b');
  const root = ROOT_MAP[(match[1].toUpperCase() + accidental).toUpperCase()];
  if (root === undefined) return null;
  const suffix = match[3] || '';
  const minor = /^(m(?!aj)|min|-)/i.test(suffix);
  const diminished = /dim|°/i.test(suffix);
  return { raw: cleaned, root, suffix, minor, diminished };
}

export function parseProgression(input:string) {
  return input.split(/\s+/).map(parseChord).filter((chord): chord is ParsedChord => Boolean(chord));
}

function expectedQuality(mode:'major'|'minor', degree:number) {
  const major = ['maj','min','min','maj','maj','min','dim'];
  const minor = ['min','dim','maj','min','min','maj','maj'];
  return (mode === 'major' ? major : minor)[degree];
}

export function detectKey(chords:ParsedChord[]): KeyGuess {
  if (!chords.length) return { root:0, mode:'major', score:0, confidence:0, roman:[] };
  const guesses: KeyGuess[] = [];
  for (const mode of ['major','minor'] as const) {
    const scale = mode === 'major' ? MAJOR_SCALE : MINOR_SCALE;
    for (let root=0; root<12; root++) {
      let score = 0;
      chords.forEach((chord,index) => {
        const interval = (chord.root-root+12)%12;
        const degree = scale.indexOf(interval);
        if (degree < 0) score -= 1.2;
        else {
          score += 2;
          const quality = chord.diminished ? 'dim' : chord.minor ? 'min' : 'maj';
          if (quality === expectedQuality(mode,degree)) score += 1.4;
          if (degree === 0) score += 1.1;
        }
        if ((index === 0 || index === chords.length-1) && chord.root === root) score += 1.8;
      });
      const roman = chords.map(chord => romanForChord(chord,root,mode));
      guesses.push({ root, mode, score, confidence:0, roman });
    }
  }
  guesses.sort((a,b)=>b.score-a.score);
  const best = guesses[0];
  const gap = Math.max(0,best.score-guesses[1].score);
  return { ...best, confidence:Math.min(99,Math.round(68 + gap*6 + chords.length*2)) };
}

function romanForChord(chord:ParsedChord,root:number,mode:'major'|'minor') {
  const scale = mode === 'major' ? MAJOR_SCALE : MINOR_SCALE;
  const degree = scale.indexOf((chord.root-root+12)%12);
  if (degree < 0) return '—';
  const numerals = ['I','II','III','IV','V','VI','VII'];
  let value = numerals[degree];
  if (chord.minor || chord.diminished) value = value.toLowerCase();
  if (chord.diminished) value += '°';
  return value;
}

export function transposeChord(chord:ParsedChord,semitones:number,preferFlats=true) {
  return `${prettyNote(chord.root+semitones,preferFlats)}${chord.suffix}`;
}

const KEY_EASE: Record<number,number> = { 7:10,0:9.5,9:9,4:8.8,2:8.2,5:7,10:5.8,11:4.8,3:4,8:3.7,6:3.2,1:3 };
export function capoOptions(chords:ParsedChord[],concertRoot:number,limit=5): CapoOption[] {
  return Array.from({length:12},(_,capo) => {
    const shapeRoot = (concertRoot-capo+12)%12;
    const preferFlats = FLAT_KEYS.has(shapeRoot);
    const shapes = chords.map(chord=>transposeChord(chord,-capo,preferFlats));
    const openFriendly = shapes.filter(shape=>/^(C|A|G|E|D|Am|Em|Dm)(7|maj7|sus[24]|add9)?$/.test(shape)).length;
    const barrePenalty = shapes.filter(shape=>/^(F|B♭|B|E♭|A♭|D♭|F♯|C♯)/.test(shape)).length;
    const score = (KEY_EASE[shapeRoot]||3) + openFriendly*1.5 - barrePenalty*.6 - capo*.22;
    const reason = openFriendly >= Math.max(2,Math.ceil(chords.length*.6)) ? 'Mostly familiar open chords' : capo <= 3 ? 'Low capo, balanced shapes' : 'Alternative voicing higher up the neck';
    return { capo, shapeRoot, shapeKey:prettyNote(shapeRoot,preferFlats), chords:shapes, score, reason };
  }).sort((a,b)=>b.score-a.score).slice(0,limit);
}

export function scaleNotes(root:number,mode:'major'|'minor') {
  return (mode === 'major' ? MAJOR_SCALE : MINOR_SCALE).map(interval=>(root+interval)%12);
}

export function noteAt(stringIndex:number,fret:number) {
  const tuning = [4,11,7,2,9,4]; // high E to low E
  return (tuning[stringIndex]+fret)%12;
}
