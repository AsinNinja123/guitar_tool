import type { ChordPosition } from '@/lib/chords';

type Props = {
  position: ChordPosition;
  name: string;
};

export function ChordDiagram({ position, name }: Props) {
  const width = 220;
  const height = 250;
  const left = 38;
  const top = 38;
  const stringGap = 28;
  const fretGap = 39;
  const diagramBottom = top + fretGap * 4;
  const hasNut = position.baseFret === 1;
  const barreRuns = position.barres.map(fret => {
    const strings = position.frets
      .map((value, index) => ({ value, index }))
      .filter(item => item.value === fret)
      .map(item => item.index);
    return strings.length > 1 ? { fret, from: Math.min(...strings), to: Math.max(...strings) } : null;
  }).filter((barre): barre is { fret: number; from: number; to: number } => Boolean(barre));

  return (
    <svg className="chord-diagram" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${name} chord diagram`}>
      <title>{name} chord diagram</title>
      {position.baseFret > 1 && <text x="8" y={top + 25} className="fret-label">{position.baseFret}fr</text>}
      {Array.from({ length: 6 }, (_, string) => (
        <line key={`string-${string}`} x1={left + string * stringGap} x2={left + string * stringGap} y1={top} y2={diagramBottom} className="diagram-string" />
      ))}
      {Array.from({ length: 5 }, (_, fret) => (
        <line key={`fret-${fret}`} x1={left} x2={left + stringGap * 5} y1={top + fret * fretGap} y2={top + fret * fretGap} className={fret === 0 && hasNut ? 'diagram-nut' : 'diagram-fret'} />
      ))}
      {position.frets.map((fret, string) => {
        const x = left + string * stringGap;
        if (fret < 0) return <g key={`marker-${string}`} className="muted-marker"><line x1={x - 5} x2={x + 5} y1="14" y2="24"/><line x1={x + 5} x2={x - 5} y1="14" y2="24"/></g>;
        if (fret === 0) return <circle key={`marker-${string}`} cx={x} cy="19" r="5.5" className="open-marker"/>;
        const isBarred = barreRuns.some(barre => barre.fret === fret && string >= barre.from && string <= barre.to);
        if (isBarred) return null;
        return <circle key={`marker-${string}`} cx={x} cy={top + (fret - .5) * fretGap} r="10" className="finger-dot"/>;
      })}
      {barreRuns.map((barre, index) => (
        <line key={`barre-${index}`} x1={left + barre.from * stringGap} x2={left + barre.to * stringGap} y1={top + (barre.fret - .5) * fretGap} y2={top + (barre.fret - .5) * fretGap} className="barre-line"/>
      ))}
      <text x={width / 2} y="232" textAnchor="middle" className="tuning-label">E · A · D · G · B · E</text>
    </svg>
  );
}
