type Props = {
  original: string;
  transposed: string;
  onSelect?: (chord: string) => void;
  block?: boolean;
};

/** A transposed chord with its original ghosted faintly above it. */
export function ChordSwap({ original, transposed, onSelect, block }: Props) {
  const changed = original !== transposed;
  const content = (
    <>
      <span className="ghost-chord" aria-hidden={!changed}>{changed ? original : ''}</span>
      <span className="live-chord">{transposed}</span>
    </>
  );
  if (!onSelect) return <span className={`chord-swap ${block ? 'block' : ''}`}>{content}</span>;
  return (
    <button
      type="button"
      className={`chord-swap ${block ? 'block' : ''}`}
      title={changed ? `${original} becomes ${transposed}` : transposed}
      onClick={() => onSelect(transposed)}
    >
      {content}
    </button>
  );
}
