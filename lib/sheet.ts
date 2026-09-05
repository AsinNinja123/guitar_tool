/* ── Sheet music import ──────────────────────────────────────────────
   Reads a chord chart PDF (or image), finds every chord on the page,
   and redraws the page with transposed chords sitting in exactly the
   same spot. Text-based PDFs are handled entirely in the browser.
   Scanned pages fall back to the vision API in /api/sheet/ocr. */

import { parseChord, prettyNote, transposeChord, type ParsedChord } from '@/lib/music';

export const CHORD_TOKEN = /^[|,([\]]*[A-G](?:#|♯|b|♭)?(?:(?:maj|min|dim|aug|sus|add|m|M)?\d*(?:[#b+°-]\d*)?(?:\/[A-G](?:#|♯|b|♭)?)?)[|,()[\]]*$/;

export type SheetToken = {
  text: string;
  x: number;      // left edge, canvas pixels
  y: number;      // text baseline, canvas pixels
  width: number;
  height: number; // approximate font size in pixels
  chord: ParsedChord | null;
};

export type SheetPage = {
  index: number;
  width: number;
  height: number;
  image: string;        // original page as a PNG data URL
  tokens: SheetToken[];
  scanned: boolean;
  ocrUsed: boolean;
};

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

type LoadedScript = Record<string, unknown>;

function loadScript(src: string, globalKey: string): Promise<LoadedScript> {
  const globalWindow = window as unknown as Record<string, LoadedScript | undefined>;
  if (globalWindow[globalKey]) return Promise.resolve(globalWindow[globalKey] as LoadedScript);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-lib="${globalKey}"]`);
    const attach = (element: HTMLScriptElement) => {
      element.addEventListener('load', () => {
        const value = globalWindow[globalKey];
        if (value) resolve(value);
        else reject(new Error(`${globalKey} did not load`));
      });
      element.addEventListener('error', () => reject(new Error(`Could not reach ${src}`)));
    };
    if (existing) { attach(existing as HTMLScriptElement); return; }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.lib = globalKey;
    attach(script);
    document.head.appendChild(script);
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function pdfjs(): Promise<any> {
  const lib = await loadScript(PDFJS_URL, 'pdfjsLib') as any;
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return lib;
}

/** Split one PDF text run into words, estimating each word's own x offset. */
function splitRun(text: string, x: number, y: number, width: number, height: number): SheetToken[] {
  const perCharacter = text.length ? width / text.length : 0;
  const tokens: SheetToken[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    tokens.push({
      text: raw,
      x: x + match.index * perCharacter,
      y,
      width: raw.length * perCharacter,
      height,
      chord: CHORD_TOKEN.test(raw) ? parseChord(raw) : null,
    });
  }
  return tokens;
}

/** Read a PDF into rendered page images plus positioned text. */
export async function readPdf(file: File, scale = 2): Promise<SheetPage[]> {
  const lib = await pdfjs();
  const buffer = await file.arrayBuffer();
  const document_ = await lib.getDocument({ data: buffer }).promise;
  const pages: SheetPage[] = [];
  for (let number = 1; number <= document_.numPages; number++) {
    const page = await document_.getPage(number);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const content = await page.getTextContent();
    const tokens: SheetToken[] = [];
    for (const item of content.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const transform = lib.Util.transform(viewport.transform, item.transform);
      const height = Math.hypot(transform[2], transform[3]) || item.height * scale;
      tokens.push(...splitRun(item.str, transform[4], transform[5], (item.width || 0) * scale, height));
    }
    pages.push({
      index: number - 1,
      width: canvas.width,
      height: canvas.height,
      image: canvas.toDataURL('image/png'),
      tokens,
      scanned: tokens.filter(token => token.chord).length < 2,
      ocrUsed: false,
    });
  }
  return pages;
}

/** Read a photo or screenshot of a chart. Always needs the vision pass. */
export async function readImage(file: File): Promise<SheetPage[]> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('That image could not be opened.'));
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return [{
      index: 0,
      width: canvas.width,
      height: canvas.height,
      image: canvas.toDataURL('image/png'),
      tokens: [],
      scanned: true,
      ocrUsed: false,
    }];
  } finally { URL.revokeObjectURL(url); }
}

type OcrToken = { text: string; x: number; y: number; width: number; height: number };

/** Ask the vision API where the chords sit on a scanned page. */
export async function readScannedPage(page: SheetPage): Promise<SheetPage> {
  const response = await fetch('/api/sheet/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: page.image }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error || 'The vision service could not read that page.');
  }
  const data = await response.json() as { chords?: OcrToken[] };
  const tokens: SheetToken[] = (data.chords || []).map(token => ({
    text: token.text,
    x: token.x * page.width,
    y: (token.y + token.height) * page.height,
    width: token.width * page.width,
    height: token.height * page.height,
    chord: CHORD_TOKEN.test(token.text) ? parseChord(token.text) : null,
  })).filter(token => token.chord);
  return { ...page, tokens, ocrUsed: true, scanned: true };
}

export function pageChords(pages: SheetPage[]) {
  return pages.flatMap(page => page.tokens.map(token => token.chord)).filter((chord): chord is ParsedChord => Boolean(chord));
}

function averageColor(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const safeWidth = Math.max(1, Math.min(Math.ceil(width), context.canvas.width - left));
  const safeHeight = Math.max(1, Math.min(Math.ceil(height), context.canvas.height - top));
  const { data } = context.getImageData(left, top, safeWidth, safeHeight);
  let red = 0, green = 0, blue = 0, count = 0;
  let darkest = 255, darkRed = 30, darkGreen = 30, darkBlue = 30;
  for (let index = 0; index < data.length; index += 4) {
    red += data[index]; green += data[index + 1]; blue += data[index + 2]; count++;
    const luminance = (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    if (luminance < darkest) { darkest = luminance; darkRed = data[index]; darkGreen = data[index + 1]; darkBlue = data[index + 2]; }
  }
  return {
    background: `rgb(${Math.round(red / count)},${Math.round(green / count)},${Math.round(blue / count)})`,
    ink: `rgb(${darkRed},${darkGreen},${darkBlue})`,
  };
}

export type RenderOptions = {
  shift: number;
  preferFlats: boolean;
  showGhost: boolean;
};

/**
 * Repaint one page: original artwork untouched, every chord replaced
 * by its transposed version in the same position, with the original
 * ghosted faintly above it.
 */
export async function renderTransposedPage(page: SheetPage, options: RenderOptions): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const context = canvas.getContext('2d')!;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('The page image could not be redrawn.'));
    element.src = page.image;
  });
  context.drawImage(image, 0, 0);

  for (const token of page.tokens) {
    if (!token.chord) continue;
    const replacement = transposeChord(token.chord, options.shift, options.preferFlats);
    if (replacement === token.chord.raw && !options.showGhost) continue;
    const padding = token.height * 0.18;
    const boxTop = token.y - token.height;
    const sample = averageColor(context, token.x, boxTop - token.height * 0.9, Math.max(token.width, 6), token.height * 0.7);
    const inkSample = averageColor(context, token.x, boxTop, Math.max(token.width, 6), token.height);

    context.fillStyle = sample.background;
    context.fillRect(token.x - padding, boxTop - padding, token.width + padding * 2, token.height + padding * 2);

    context.font = `bold ${token.height * 0.95}px ${'Helvetica, Arial, sans-serif'}`;
    context.textBaseline = 'alphabetic';
    context.fillStyle = inkSample.ink;
    context.fillText(replacement, token.x, token.y);

    if (options.showGhost && replacement !== token.chord.raw) {
      context.font = `${token.height * 0.58}px Helvetica, Arial, sans-serif`;
      context.fillStyle = 'rgba(120,105,90,.62)';
      context.fillText(token.chord.raw, token.x, boxTop - token.height * 0.18);
    }
  }
  return canvas;
}

/** Bundle the redrawn pages back into a single downloadable PDF. */
export async function canvasesToPdf(canvases: HTMLCanvasElement[], filename: string) {
  const lib = await loadScript(JSPDF_URL, 'jspdf') as any;
  const { jsPDF } = lib;
  let document_: any = null;
  canvases.forEach(canvas => {
    const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
    if (!document_) document_ = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
    else document_.addPage([canvas.width, canvas.height], orientation);
    document_.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
  });
  if (document_) document_.save(filename);
}

export function chordSummary(chords: ParsedChord[], shift: number, preferFlats: boolean) {
  const seen = new Map<string, string>();
  for (const chord of chords) {
    if (!seen.has(chord.raw)) seen.set(chord.raw, transposeChord(chord, shift, preferFlats));
  }
  return [...seen.entries()].map(([from, to]) => ({ from, to }));
}

export function keyLabel(pitchClass: number) {
  return prettyNote(pitchClass, [0, 1, 3, 5, 8, 10].includes(pitchClass));
}
