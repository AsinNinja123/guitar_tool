'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChordDiagram } from '@/components/ChordDiagram';
import { ChordSwap } from '@/components/ChordSwap';
import { SheetImporter } from '@/components/SheetImporter';
import { CHORD_KEYS, CHORD_SUFFIXES, CHORD_VOICING_COUNT, chordDisplayName, easiestFirst, findChord, lookupChord, searchChords, suffixLabel } from '@/lib/chords';
import { KEY_OPTIONS, capoOptions, detectKey, noteAt, parseChord, prettyNote, scaleNotes, transposeChord, type ParsedChord } from '@/lib/music';
import { getSupabase } from '@/lib/supabase';

type Tab = 'search' | 'transpose' | 'chords' | 'fretboard' | 'practice';
type SavedSong = { id:number; title:string; artist:string; progression:string; sourceKey:number; mode:'major'|'minor'; targetKey?:number; capo?:number };
type CatalogSong = { id:string; title:string; artist:string; album:string; image:string|null; url:string|null; isrc:string|null; provider:'spotify'|'itunes'|'musicbrainz'; key:number|null; mode:'major'|'minor'|null; confidence:number|null; progression:string|null };

const SONG_STORE = 'chars-guitar-songs';
const LEGACY_SONG_STORE = 'fretwise-songs';
const NOTE_TO_DB = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const STARTER_SONGS = [
  { title:'Stand By Me', artist:'Ben E. King', progression:'A F#m D E', spotify:'https://open.spotify.com/search/Stand%20By%20Me%20Ben%20E%20King' },
  { title:'Riptide', artist:'Vance Joy', progression:'Am G C C', spotify:'https://open.spotify.com/search/Riptide%20Vance%20Joy' },
  { title:'Goodness of God', artist:'Bethel Music', progression:'G C G Em D C', spotify:'https://open.spotify.com/search/Goodness%20of%20God' },
  { title:'Until I Found You', artist:'Stephen Sanchez', progression:'Bb D7 Eb Ebm', spotify:'https://open.spotify.com/search/Until%20I%20Found%20You' },
];

const CHORD_TOKEN = /^[|,([\]]*[A-Ga-g](?:#|♯|b|♭)?(?:(?:maj|min|dim|aug|sus|add|m|M)?\d*(?:[#b+°-]\d*)?(?:\/[A-G](?:#|♯|b|♭)?)?)[|,()[\]]*$/;

function extractChords(input:string) {
  return input.split(/\s+/).filter(token => CHORD_TOKEN.test(token)).map(parseChord).filter((chord): chord is ParsedChord => Boolean(chord));
}

function suffixForLibrary(suffix:string) {
  if (!suffix) return 'major';
  if (/^(m|min|-)$/i.test(suffix)) return 'minor';
  return suffix.toLowerCase().replace(/^min/, 'm');
}

export default function Home() {
  const [activeTab,setActiveTab] = useState<Tab>('search');
  const [progression,setProgression] = useState('G  D  Em  C');
  const [analysisInput,setAnalysisInput] = useState(progression);
  const [targetKey,setTargetKey] = useState(9);
  const [selectedCapo,setSelectedCapo] = useState(0);
  const [fretMode,setFretMode] = useState<'major'|'minor'>('major');
  const [libraryOpen,setLibraryOpen] = useState(false);
  const [songTitle,setSongTitle] = useState('Untitled progression');
  const [savedSongs,setSavedSongs] = useState<SavedSong[]>([]);
  const [search,setSearch] = useState('');
  const [catalogSongs,setCatalogSongs] = useState<CatalogSong[]>([]);
  const [searchState,setSearchState] = useState<'idle'|'searching'|'done'>('idle');
  const [catalogProvider,setCatalogProvider] = useState('starter library');
  const [selectedCatalog,setSelectedCatalog] = useState<CatalogSong|null>(null);
  const [knownKey,setKnownKey] = useState<{root:number;mode:'major'|'minor';confidence:number}|null>(null);
  const [userId,setUserId] = useState<string|null>(null);
  const [userEmail,setUserEmail] = useState<string|null>(null);
  const [authEmail,setAuthEmail] = useState('');
  const [authMessage,setAuthMessage] = useState('');
  const [chordKey,setChordKey] = useState('G');
  const [chordSuffix,setChordSuffix] = useState('major');
  const [chordSearch,setChordSearch] = useState('');
  const [ghostMode,setGhostMode] = useState(true);
  const [quiz,setQuiz] = useState({ string:5, fret:3, score:0, total:0, message:'Find the note, then check your answer.' });

  const chords = useMemo(()=>extractChords(analysisInput),[analysisInput]);
  const theoryGuess = useMemo(()=>detectKey(chords),[chords]);
  const guess = knownKey ? {...theoryGuess,root:knownKey.root,mode:knownKey.mode,confidence:knownKey.confidence} : theoryGuess;
  const shift = (targetKey-guess.root+12)%12;
  const preferFlats = [0,1,3,5,8,10].includes(targetKey);
  const targetChords = useMemo(()=>chords.map(chord=>({...chord,root:(chord.root+shift)%12})),[chords,shift]);
  const options = useMemo(()=>targetChords.length?capoOptions(targetChords,targetKey,5):[],[targetChords,targetKey]);
  const selected = options.find(option=>option.capo===selectedCapo) || options[0];
  const selectedScale = scaleNotes(targetKey,fretMode);
  const selectedChord = useMemo(()=>findChord(chordKey,chordSuffix),[chordKey,chordSuffix]);
  const selectedVoicings = useMemo(()=>selectedChord?easiestFirst(selectedChord.positions):[],[selectedChord]);
  const chordMatches = useMemo(()=>searchChords(chordSearch,36),[chordSearch]);
  // A chord name typed into the song search bar — answer it right there.
  const quickChord = useMemo(()=>lookupChord(search,3),[search]);

  useEffect(()=>{
    // Hydrate the device-local songbook after the client mounts.
    try {
      const stored = localStorage.getItem(SONG_STORE) || localStorage.getItem(LEGACY_SONG_STORE) || '[]';
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedSongs(JSON.parse(stored));
    } catch {}
    const supabase=getSupabase(); if(!supabase)return;
    supabase.auth.getSession().then(({data})=>{setUserId(data.session?.user.id||null);setUserEmail(data.session?.user.email||null)});
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{setUserId(session?.user.id||null);setUserEmail(session?.user.email||null)});
    return ()=>data.subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!userId)return; const supabase=getSupabase(); if(!supabase)return;
    supabase.from('saved_songs').select('*').order('created_at',{ascending:false}).limit(50).then(({data})=>{if(data)setSavedSongs(data.map(row=>({id:row.id,title:row.title,artist:row.artist,progression:row.progression,sourceKey:row.source_key,mode:row.mode,targetKey:row.target_key,capo:row.capo}))) });
  },[userId]);
  useEffect(()=>{
    // Clear stale remote results when the query is too short, or when it is a chord name.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if(search.trim().length<2||quickChord){setCatalogSongs([]);setSearchState('idle');setCatalogProvider(quickChord?'chord library':'starter library');return}
    const controller=new AbortController(); const timer=setTimeout(async()=>{setSearchState('searching');try{const response=await fetch(`/api/catalog/search?q=${encodeURIComponent(search)}`,{signal:controller.signal});const data=await response.json() as {tracks:CatalogSong[];provider:string};setCatalogSongs(data.tracks||[]);setCatalogProvider(data.provider==='spotify'?'Spotify catalog':data.provider==='itunes'?'Apple Music catalog':data.provider==='musicbrainz'?'MusicBrainz catalog':'catalog');}catch{}finally{setSearchState('done')}},350);
    return()=>{clearTimeout(timer);controller.abort()};
  },[search,quickChord]);

  function changeTab(tab:Tab) { setActiveTab(tab); window.scrollTo({top:0,behavior:'smooth'}); }
  function analyze() { const parsed=extractChords(progression); if(!parsed.length)return; setKnownKey(null); setAnalysisInput(progression); const next=detectKey(parsed); setTargetKey(next.root); setFretMode(next.mode); setSelectedCapo(0); }
  function loadSong(song:{title:string;progression:string;artist?:string}) { setSelectedCatalog(null);setKnownKey(null);setSongTitle(song.title);setProgression(song.progression);setAnalysisInput(song.progression);const next=detectKey(extractChords(song.progression));setTargetKey(next.root);setFretMode(next.mode);changeTab('transpose'); }
  function chooseCatalogSong(song:CatalogSong) { setSelectedCatalog(song);setSongTitle(song.title);setProgression(song.progression||'');setAnalysisInput(song.progression||'');const override=song.key!==null&&song.mode?{root:song.key,mode:song.mode,confidence:song.confidence||80}:null;setKnownKey(override);if(override){setTargetKey(override.root);setFretMode(override.mode)}changeTab('transpose'); }
  function showChord(raw:string) { const parsed=parseChord(raw); if(!parsed)return; const suffix=suffixForLibrary(parsed.suffix);setChordKey(NOTE_TO_DB[parsed.root]);setChordSuffix(CHORD_SUFFIXES.includes(suffix)?suffix:'major');setChordSearch('');changeTab('chords'); }
  function openChordLibrary(key:string,suffix:string) { setChordKey(key);setChordSuffix(suffix);setChordSearch('');changeTab('chords'); }

  // A PDF or photo came back with chords in it — treat it as the working sheet.
  const adoptSheetChords = useCallback((found:ParsedChord[],name:string)=>{
    const text=found.map(chord=>chord.raw).join(' ');
    setSelectedCatalog(null);setKnownKey(null);setSongTitle(name||'Imported chart');
    setProgression(text);setAnalysisInput(text);
    const next=detectKey(found);setTargetKey(next.root);setFretMode(next.mode);setSelectedCapo(0);
  },[]);

  async function saveSong() {
    if(!analysisInput.trim())return;
    const next:SavedSong={id:Date.now(),title:songTitle||'Untitled progression',artist:selectedCatalog?.artist||'My library',progression:analysisInput,sourceKey:guess.root,mode:guess.mode,targetKey,capo:selected?.capo||0};
    const updated=[next,...savedSongs].slice(0,50); setSavedSongs(updated); localStorage.setItem(SONG_STORE,JSON.stringify(updated));
    const supabase=getSupabase(); if(userId&&supabase){await supabase.from('saved_songs').insert({user_id:userId,title:next.title,artist:next.artist,progression:next.progression,source_key:next.sourceKey,mode:next.mode,target_key:targetKey,capo:next.capo});}
    setLibraryOpen(true);
  }
  async function sendMagicLink(){const supabase=getSupabase();if(!supabase){setAuthMessage('Add the Supabase settings to enable cloud sync.');return}const {error}=await supabase.auth.signInWithOtp({email:authEmail,options:{emailRedirectTo:window.location.origin}});setAuthMessage(error?error.message:'Check your email for the sign-in link.');}
  async function signOut(){await getSupabase()?.auth.signOut();setAuthMessage('Signed out. Your local songs stay on this device.');}
  function answerQuiz(pc:number) { const correct=noteAt(quiz.string,quiz.fret)===pc; setQuiz(current=>({...current,score:current.score+(correct?1:0),total:current.total+1,message:correct?'That’s it — nice work.':`That note is ${prettyNote(noteAt(current.string,current.fret),true)}.`,string:Math.floor(Math.random()*6),fret:Math.floor(Math.random()*13)})); }

  function renderSheetLine(line:string,index:number) {
    const tokens=line.split(/(\s+)/); const chordLine=tokens.some(token=>CHORD_TOKEN.test(token));
    if(!chordLine)return <div className="lyric-line" key={index}>{line||' '}</div>;
    const transposedLine=<div className="transposed-line">{tokens.map((token,i)=>{
      const parsed=CHORD_TOKEN.test(token)?parseChord(token):null;
      if(!parsed)return <span key={i}>{token}</span>;
      const swapped=transposeChord(parsed,shift,preferFlats);
      return ghostMode
        ? <ChordSwap key={i} original={parsed.raw} transposed={swapped} onSelect={showChord}/>
        : <button key={i} onClick={()=>showChord(swapped)}>{swapped}</button>;
    })}</div>;
    return <div className={`sheet-line-pair ${ghostMode?'ghosted':''}`} key={index}>
      {!ghostMode&&<div className="original-line">{line}</div>}
      {transposedLine}
    </div>;
  }

  const keyName=prettyNote(guess.root,[0,1,3,5,8,10].includes(guess.root));
  const targetName=prettyNote(targetKey,preferFlats);
  const showingChordAnswer=Boolean(quickChord);
  const visibleSongs=search.trim().length>=2?catalogSongs:STARTER_SONGS;

  return <main>
    <header className="app-header">
      <button className="brand" onClick={()=>changeTab('search')}><span className="brand-mark">C</span><span>Char&rsquo;s Guitar</span></button>
      <nav className="tab-nav" aria-label="Main sections">
        {([['search','Search'],['transpose','Transpose'],['chords','Chord library'],['fretboard','Fretboard'],['practice','Practice']] as [Tab,string][]).map(([tab,label])=><button key={tab} className={activeTab===tab?'active':''} onClick={()=>changeTab(tab)}>{label}</button>)}
      </nav>
      <button className="library-button" onClick={()=>setLibraryOpen(true)}>My songs <span>{savedSongs.length}</span></button>
    </header>

    {activeTab==='search'&&<section className="tab-page search-page">
      <div className="page-heading"><div><p className="eyebrow">SONGS &amp; CHORDS</p><h1>Search a song.<br/><em>Or just a chord.</em></h1><p>Type a song title to pull up the recording, or type a chord name — G, F#m7, Bbadd9 — and get the easiest ways to play it straight away.</p></div><div className="mini-stat"><b>{savedSongs.length}</b><span>songs saved</span></div></div>
      <div className="song-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Song title — artist name, or a chord like F#m7" aria-label="Search songs and chords"/><small>{searchState==='searching'?'Searching…':catalogProvider}</small></div>
      <p className="search-tip">{showingChordAnswer?'Chord recognized — easiest shapes first.':'Include the artist for the best match. Song search identifies recordings; your saved chord sheets stay in your personal library.'}</p>

      {quickChord?<div className="quick-chord">
        <div className="quick-chord-head">
          <div><h2>{quickChord.name}</h2><span>{quickChord.label}</span></div>
          <button onClick={()=>openChordLibrary(quickChord.key,quickChord.suffix)}>All {quickChord.total} voicings →</button>
        </div>
        <div className="quick-chord-grid">{quickChord.positions.map((position,index)=><article key={index}>
          <div className="diagram-card-head"><span>{index===0?'EASIEST':`OPTION ${index+1}`}</span><b>{position.baseFret===1?'Open position':`Fret ${position.baseFret}`}</b></div>
          <ChordDiagram position={position} name={`${quickChord.name} ${index+1}`}/>
          <div className="shape-code">{position.frets.map(fret=>fret<0?'×':fret).join(' · ')}</div>
        </article>)}</div>
      </div>:<div className="song-list">{visibleSongs.slice(0,12).map((song,index)=>{const catalog='provider' in song;return <article key={`${song.title}-${index}`}>{catalog&&song.image?<img src={song.image} alt=""/>:<div className="album-placeholder">♪</div>}<div><button onClick={()=>catalog?chooseCatalogSong(song as CatalogSong):loadSong(song)}><b>{song.title}</b><span>{song.artist}</span>{catalog&&<small>{song.key!==null?`${prettyNote(song.key,true)} ${song.mode} · verified key`:'Select and add chords'}</small>}</button>{catalog&&song.url&&<a href={song.url} target="_blank" rel="noreferrer">Open recording ↗</a>}{!catalog&&'spotify' in song&&<a href={song.spotify} target="_blank" rel="noreferrer">Open in Spotify ↗</a>}</div></article>})}{searchState==='done'&&!visibleSongs.length&&<p className="empty-state">No match yet. Try adding the artist name.</p>}</div>}
    </section>}

    {activeTab==='transpose'&&<section className="tab-page transpose-page">
      <div className="page-heading compact"><div><p className="eyebrow">TRANSPOSING WORKSPACE</p><h1>{selectedCatalog?selectedCatalog.title:'Transpose a chord sheet'}</h1><p>{selectedCatalog?`${selectedCatalog.artist} · paste or enter the chords below`:'Paste a progression, type a full sheet, or import a PDF. Lyrics and spacing stay in place.'}</p></div><div className="key-badge"><span>Detected key</span><b>{keyName}</b><small>{guess.mode} · {guess.confidence}%</small></div></div>
      <div className="transpose-workspace">
        <div className="sheet-input"><label htmlFor="progression">ORIGINAL CHORDS OR FULL SHEET</label><textarea id="progression" value={progression} onChange={e=>setProgression(e.target.value)} placeholder={'G        D\nAmazing grace, how sweet the sound\nEm       C\nThat saved a wretch like me'}/><button onClick={analyze}>Analyze sheet <span>→</span></button></div>
        <aside className="transpose-controls"><label><span>ORIGINAL KEY</span><b>{keyName} {guess.mode}</b></label><label><span>TRANSPOSE TO</span><select value={targetKey} onChange={e=>{setTargetKey(Number(e.target.value));setSelectedCapo(0)}}>{KEY_OPTIONS.map(key=><option key={key.value} value={key.value}>{key.label} {guess.mode}</option>)}</select></label><p>Every transposed chord carries its original faintly above it, so you always know what became what.</p></aside>
      </div>
      <section className="comparison-sheet"><div className="sheet-toolbar"><div><p className="eyebrow">CHORD SHEET</p><h2>{songTitle}</h2></div><div className="sheet-view-toggle"><button className={ghostMode?'active':''} onClick={()=>setGhostMode(true)}>Ghost original</button><button className={ghostMode?'':'active'} onClick={()=>setGhostMode(false)}>Side by side</button></div></div><div className="sheet-body">{analysisInput.split('\n').map(renderSheetLine)}</div></section>

      <SheetImporter shift={shift} preferFlats={preferFlats} showGhost={ghostMode} targetLabel={`${targetName} ${guess.mode}`} onChordsFound={adoptSheetChords}/>

      <div className="options-heading"><div><p className="eyebrow">CAPO &amp; SHAPES</p><h2>Same sound, friendlier shapes.</h2></div><p>Faint chord on top is the original. Tap any chord to see how to play it.</p></div>
      {options.length?<div className="option-grid">{options.slice(0,3).map((option,index)=><article className={`capo-card ${index===0?'best':''} ${selected?.capo===option.capo?'selected':''}`} key={option.capo}>{index===0&&<div className="recommendation">BEST CHOICE</div>}<div className="capo-card-head"><span>PLAY IN</span><b>{option.shapeKey}</b><small>Capo {option.capo||'none'}</small></div><div className="chord-row">{option.chords.map((chord,i)=><ChordSwap key={`${chord}-${i}`} original={chords[i]?.raw||''} transposed={chord} onSelect={showChord} block/>)}</div><p>{option.reason}</p><button className="use-button" onClick={()=>setSelectedCapo(option.capo)}>{selected?.capo===option.capo?'Selected':'Use these shapes'}</button></article>)}</div>:<div className="empty-state card">Add recognizable chords above, then analyze the sheet.</div>}
      {selected&&<div className="save-bar"><div><b>{targetName} {guess.mode}</b><span> · play in {selected.shapeKey} · capo {selected.capo||'none'}</span></div><label>Song name <input value={songTitle} onChange={e=>setSongTitle(e.target.value)}/></label><button onClick={saveSong}>Save to my songs</button></div>}
    </section>}

    {activeTab==='chords'&&<section className="tab-page chord-page">
      <div className="page-heading compact"><div><p className="eyebrow">STANDARD TUNING · E A D G B E</p><h1>Chord library</h1><p>{CHORD_VOICING_COUNT.toLocaleString()} accurate positions—from open chords to movable CAGED and extended voicings. Easiest shapes come first.</p></div></div>
      <div className="chord-tools"><div className="chord-search"><span>⌕</span><input value={chordSearch} onChange={e=>setChordSearch(e.target.value)} placeholder="Search G, F#m7, Bbadd9…" aria-label="Search chord library"/></div><label>ROOT<select value={chordKey} onChange={e=>{setChordKey(e.target.value);setChordSearch('')}}>{CHORD_KEYS.map(key=><option key={key}>{key}</option>)}</select></label><label>CHORD TYPE<select value={chordSuffix} onChange={e=>{setChordSuffix(e.target.value);setChordSearch('')}}>{CHORD_SUFFIXES.map(suffix=><option key={suffix} value={suffix}>{suffixLabel(suffix)}</option>)}</select></label></div>
      {chordSearch?<div className="chord-results">{chordMatches.map(chord=><button key={`${chord.key}-${chord.suffix}`} onClick={()=>{setChordKey(chord.key);setChordSuffix(chord.suffix);setChordSearch('')}}><b>{chord.name}</b><span>{suffixLabel(chord.suffix)} · {chord.positions.length} shapes</span></button>)}</div>:selectedChord&&<><div className="chord-title"><div><h2>{chordDisplayName(chordKey,chordSuffix)}</h2><span>{suffixLabel(chordSuffix)}</span></div><p>{selectedVoicings.length} playable voicings · easiest first</p></div><div className="diagram-grid">{selectedVoicings.map((position,index)=><article key={index}><div className="diagram-card-head"><span>{index===0?'EASIEST':'ALTERNATE VOICING'}</span><b>{position.baseFret===1?'Open position':`Starts at fret ${position.baseFret}`}</b></div><ChordDiagram position={position} name={`${chordDisplayName(chordKey,chordSuffix)} ${index+1}`}/><div className="shape-code">{position.frets.map(fret=>fret<0?'×':fret).join(' · ')}</div></article>)}</div></>}
    </section>}

    {activeTab==='fretboard'&&<section className="tab-page fret-page"><div className="page-heading compact"><div><p className="eyebrow">INTERACTIVE FRETBOARD</p><h1>Every note has an address.</h1><p>See a major or minor scale across the first twelve frets in standard tuning.</p></div><div className="scale-controls"><select value={targetKey} onChange={e=>setTargetKey(Number(e.target.value))}>{KEY_OPTIONS.map(key=><option key={key.value} value={key.value}>{key.label}</option>)}</select><button className={fretMode==='major'?'active':''} onClick={()=>setFretMode('major')}>Major</button><button className={fretMode==='minor'?'active':''} onClick={()=>setFretMode('minor')}>Minor</button></div></div><div className="fretboard-wrap"><div className="fret-numbers"><span>OPEN</span>{Array.from({length:12},(_,i)=><span key={i}>{i+1}</span>)}</div><div className="fretboard">{Array.from({length:6},(_,string)=><div className="guitar-string" key={string}>{Array.from({length:13},(_,fret)=>{const note=noteAt(string,fret);const inScale=selectedScale.includes(note);return <span className={`${inScale?'in-scale':''} ${note===targetKey?'root-note':''}`} key={fret}>{inScale?prettyNote(note,preferFlats):''}</span>})}</div>)}</div><div className="string-names">high E · B · G · D · A · low E</div></div></section>}

    {activeTab==='practice'&&<section className="tab-page practice-page"><div className="page-heading compact"><div><p className="eyebrow">NOTE PRACTICE</p><h1>Learn it until it’s automatic.</h1><p>The first string is the high E string.</p></div></div><div className="quiz-card"><div className="quiz-score"><span>SCORE</span><b>{quiz.score}/{quiz.total}</b></div><p>What note is on <b>string {quiz.string+1}</b>, <b>fret {quiz.fret}</b>?</p><div className="answer-grid">{KEY_OPTIONS.map(key=><button key={key.value} onClick={()=>answerQuiz(key.value)}>{key.label}</button>)}</div><small>{quiz.message}</small></div></section>}

    {libraryOpen&&<div className="modal-backdrop" onMouseDown={()=>setLibraryOpen(false)}><section className="library-modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setLibraryOpen(false)}>×</button><p className="eyebrow">MY SONGS</p><h2>Saved chord sheets</h2><div className="sync-box">{userEmail?<><b>Synced as {userEmail}</b><button onClick={signOut}>Sign out</button></>:<><b>Sync phone + laptop</b><div className="auth-row"><input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@example.com"/><button onClick={sendMagicLink}>Send link</button></div></>}{authMessage&&<small>{authMessage}</small>}</div>{savedSongs.length?<div className="saved-list">{savedSongs.map(song=><button key={song.id} onClick={()=>{setLibraryOpen(false);loadSong(song)}}><b>{song.title}</b><span>{song.artist} · {song.progression.slice(0,80)}</span></button>)}</div>:<div className="empty-state card">Your song library is waiting. Transpose a sheet and save it here.</div>}</section></div>}
  </main>;
}
