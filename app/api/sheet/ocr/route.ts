import { NextRequest, NextResponse } from 'next/server';

/* Vision fallback for scanned or photographed chord charts.
   Only used when a page has no readable text layer. Point these at any
   OpenAI-compatible endpoint (Luna, OpenAI, a local gateway). */

const ENDPOINT = process.env.VISION_API_URL || 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.VISION_MODEL || 'gpt-4o-mini';

const INSTRUCTIONS = `You are reading a guitar chord chart. Find every chord symbol printed on the page
(for example G, Am, F#m7, Bb/D, Csus4). Ignore lyrics, section labels, page numbers and everything else.

Reply with JSON only, in this shape:
{"chords":[{"text":"G","x":0.12,"y":0.08,"width":0.03,"height":0.02}]}

x and y are the top-left corner of the chord's bounding box, width and height its size,
all as fractions of the page from 0 to 1. Be precise about position; the boxes are used to
paint replacement text over the original. If there are no chords, reply {"chords":[]}.`;

type Body = { image?: string };

export async function POST(request: NextRequest) {
  const key = process.env.VISION_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'No vision API key configured. Add VISION_API_KEY to read scanned pages.' }, { status: 501 });
  }
  let body: Body;
  try { body = await request.json() as Body; }
  catch { return NextResponse.json({ error: 'Malformed request.' }, { status: 400 }); }
  if (!body.image?.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Send the page as a PNG data URL.' }, { status: 400 });
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: INSTRUCTIONS },
            { type: 'image_url', image_url: { url: body.image } },
          ],
        }],
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ error: `Vision service refused the page (${response.status}). ${detail.slice(0, 200)}` }, { status: 502 });
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content || '{"chords":[]}';
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')) as { chords?: unknown };
    const chords = Array.isArray(parsed.chords) ? parsed.chords : [];
    const clean = chords
      .map(item => item as Record<string, unknown>)
      .filter(item => typeof item.text === 'string')
      .map(item => ({
        text: String(item.text).trim(),
        x: Math.min(1, Math.max(0, Number(item.x) || 0)),
        y: Math.min(1, Math.max(0, Number(item.y) || 0)),
        width: Math.min(1, Math.max(0.005, Number(item.width) || 0.03)),
        height: Math.min(1, Math.max(0.005, Number(item.height) || 0.02)),
      }));
    return NextResponse.json({ chords: clean });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure';
    return NextResponse.json({ error: `Could not read that page: ${message}` }, { status: 502 });
  }
}
