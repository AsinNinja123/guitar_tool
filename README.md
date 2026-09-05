# Char's Guitar

Char's Guitar is a responsive guitar theory and transposition app. Paste a chord progression — or import a PDF chart — to detect its likely key, transpose it, compare ranked capo options, visualize scales on the fretboard, and practice note recognition.

## Features

- Search a chord by name and get the easiest few ways to play it, right in the main search bar
- Import a chord chart PDF or photo and get the same page back with transposed chords in place
- Every transposed chord shows its original ghosted faintly above it
- Major and minor key detection with Roman-numeral analysis
- Transposition into any concert key
- Ranked guitar-friendly capo and chord-shape options
- A responsive 12-fret scale visualizer
- Fretboard note quizzes
- Device-local saved songs
- Spotify catalog search with an Apple Music fallback and final MusicBrainz fallback
- Supabase email sign-in and cross-device song syncing
- A shared, confidence-scored song-key database that grows from verified chord analyses

## Development

```bash
npm install
npm run dev
```

The theory and capo engine runs locally in the browser and does not require API credentials.

## Sheet import

Drop a PDF into the Transpose tab. If the chords are real text in the file, the page is read and
repainted entirely in your browser — no API calls, no cost, and the layout is pixel-identical apart
from the swapped chords. `pdf.js` and `jsPDF` load on demand from a CDN, so there is nothing extra
to install.

Scans and phone photos have no text layer. Those pages are sent to a vision model instead, which
reports where each chord sits on the page. Set `VISION_API_KEY` (and `VISION_API_URL` /
`VISION_MODEL` if you are not using OpenAI) to enable that path. Without a key, text PDFs still work
and scanned pages report that they need one.

## Connect the live services

1. Create a Supabase project and run `supabase/migrations/001_fretwise.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local` and add the project URL and anon key.
3. Create a Spotify Developer app and add its client ID and secret to `.env.local`.
4. Add the same values in Vercel's Environment Variables settings.

Without credentials, song search automatically falls back to MusicBrainz and saved songs stay on the current device. Spotify credentials are server-only. Supabase's anon key is safe to expose because row-level security limits each user to their own saved songs.
