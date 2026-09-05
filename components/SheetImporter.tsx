'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedChord } from '@/lib/music';
import { canvasesToPdf, chordSummary, pageChords, readImage, readPdf, readScannedPage, renderTransposedPage, type SheetPage } from '@/lib/sheet';

type Props = {
  shift: number;
  preferFlats: boolean;
  showGhost: boolean;
  targetLabel: string;
  onChordsFound: (chords: ParsedChord[], filename: string) => void;
};

export function SheetImporter({ shift, preferFlats, showGhost, targetLabel, onChordsFound }: Props) {
  const [pages, setPages] = useState<SheetPage[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [filename, setFilename] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canvasCache = useRef<HTMLCanvasElement[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true); setError(''); setPreviews([]); setPages([]); setFilename(file.name);
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      setStatus(isPdf ? 'Reading the PDF…' : 'Reading the image…');
      let loaded = isPdf ? await readPdf(file) : await readImage(file);

      const needsVision = loaded.filter(page => page.scanned);
      if (needsVision.length) {
        setStatus(`Page text not found — asking the vision model to read ${needsVision.length} page${needsVision.length > 1 ? 's' : ''}…`);
        const resolved: SheetPage[] = [];
        for (const page of loaded) {
          if (!page.scanned) { resolved.push(page); continue; }
          try { resolved.push(await readScannedPage(page)); }
          catch (visionError) {
            resolved.push(page);
            setError(visionError instanceof Error ? visionError.message : 'The vision pass failed.');
          }
        }
        loaded = resolved;
      }

      const found = pageChords(loaded);
      setPages(loaded);
      setStatus(found.length ? `${found.length} chord${found.length > 1 ? 's' : ''} found across ${loaded.length} page${loaded.length > 1 ? 's' : ''}.` : 'No chords recognized on this file.');
      if (found.length) onChordsFound(found, file.name.replace(/\.[^.]+$/, ''));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That file could not be read.');
      setStatus('');
    } finally { setBusy(false); }
  }, [onChordsFound]);

  useEffect(() => {
    if (!pages.length) { canvasCache.current = []; return; }
    let live = true;
    (async () => {
      const canvases: HTMLCanvasElement[] = [];
      for (const page of pages) canvases.push(await renderTransposedPage(page, { shift, preferFlats, showGhost }));
      if (!live) return;
      canvasCache.current = canvases;
      setPreviews(canvases.map(canvas => canvas.toDataURL('image/png')));
    })();
    return () => { live = false; };
  }, [pages, shift, preferFlats, showGhost]);

  const summary = chordSummary(pageChords(pages), shift, preferFlats);

  return (
    <section className="sheet-import">
      <div className="import-head">
        <div>
          <p className="eyebrow">SHEET IMPORT</p>
          <h2>Drop in the chart. Keep the page.</h2>
          <p className="import-note">The page comes back looking exactly as it did — same layout, same lyrics, same spacing — with every chord replaced by its {targetLabel} version and the original ghosted above it.</p>
        </div>
        <div className="import-actions">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={event => { const file = event.target.files?.[0]; if (file) handleFile(file); event.target.value = ''; }}
          />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? 'Working…' : 'Choose a PDF or photo'}
          </button>
          {!!previews.length && (
            <button type="button" className="ghost-button" onClick={() => canvasesToPdf(canvasCache.current, `${filename || 'chart'} — ${targetLabel}.pdf`)}>
              Download transposed PDF
            </button>
          )}
        </div>
      </div>

      {(status || error) && (
        <div className={`import-status ${error ? 'bad' : ''}`}>
          {error || status}
          {pages.some(page => page.ocrUsed) && !error && <span> Read by the vision model — spot-check the placement.</span>}
        </div>
      )}

      {!!summary.length && (
        <div className="import-summary">
          {summary.map(pair => (
            <span key={pair.from}><i>{pair.from}</i>→<b>{pair.to}</b></span>
          ))}
        </div>
      )}

      {!!previews.length && (
        <div className="import-preview">
          {previews.map((preview, index) => (
            <figure key={index}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={`Transposed page ${index + 1}`} />
              <figcaption>Page {index + 1} of {previews.length}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
