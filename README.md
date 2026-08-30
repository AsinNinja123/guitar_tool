# Fretwise

Fretwise is a responsive guitar theory and transposition app. Paste a chord progression to detect its likely key, transpose it, compare ranked capo options, visualize scales on the fretboard, and practice note recognition.

## Features

- Major and minor key detection with Roman-numeral analysis
- Transposition into any concert key
- Ranked guitar-friendly capo and chord-shape options
- A responsive 12-fret scale visualizer
- Fretboard note quizzes
- Device-local saved songs
- Spotify catalog search with automatic MusicBrainz fallback
- Supabase email sign-in and cross-device song syncing
- A shared, confidence-scored song-key database that grows from verified chord analyses

## Development

```bash
npm install
npm run dev
```

The theory and capo engine runs locally in the browser and does not require API credentials.

## Connect the live services

1. Create a Supabase project and run `supabase/migrations/001_fretwise.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local` and add the project URL and anon key.
3. Create a Spotify Developer app and add its client ID and secret to `.env.local`.
4. Add the same four values in Vercel's Environment Variables settings.

Without credentials, song search automatically falls back to MusicBrainz and saved songs stay on the current device. Spotify credentials are server-only. Supabase's anon key is safe to expose because row-level security limits each user to their own saved songs.
