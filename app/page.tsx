'use client';

import { useEffect, useMemo, useState } from 'react';
import { KEY_OPTIONS, capoOptions, detectKey, noteAt, parseProgression, prettyNote, scaleNotes, transposeChord } from '@/lib/music';
import { getSupabase } from '@/lib/supabase';

type SavedSong = { id:number; title:string; artist:string; progression:string; sourceKey:number; mode:'major'|'minor'; targetKey?:number; capo?:number };
type CatalogSong = { id:string; title:string; artist:string; album:string; image:string|null; url:string|null; isrc:string|null; provider:'spotify'|'itunes'|'musicbrainz'; key:number|null; mode:'major'|'minor'|null; confidence:number|null; progression:string|null };
const STARTER_SONGS = [
  { title:'Stand By Me', artist:'Ben E. King', progression:'A F#m D E', spotify:'https://open.spotify.com/search/Stand%20By%20Me%20Ben%20E%20King' },
  { title:'Riptide', artist:'Vance Joy', progression:'Am G C C', spotify:'https://open.spotify.com/search/Riptide%20Vance%20Joy' },
  { title:'Goodness of God', artist:'Bethel Music', progression:'G C G Em D C', spotify:'https://open.spotify.com/search/Goodness%20of%20God' },
  { title:'Until I Found You', artist:'Stephen Sanchez', progression:'Bb D7 Eb Ebm', spotify:'https://open.spotify.com/search/Until%20I%20Found%20You' },
];

export default function Home() {
  const [progression,setProgression] = useState('Ab  Eb  Fm  Db');
  const [analysisInput,setAnalysisInput] = useState(progression);
  const [targetKey,setTargetKey] = useState(8);
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
  const [quiz,setQuiz] = useState({ string:5, fret:3, score:0, total:0, message:'Find the note, then check your answer.' });
  const chords = useMemo(()=>parseProgression(analysisInput),[analysisInput]);
  const theoryGuess = useMemo(()=>detectKey(chords),[chords]);
  const guess = knownKey ? {...theoryGuess,root:knownKey.root,mode:knownKey.mode,confidence:knownKey.confidence} : theoryGuess;
  const shift = (targetKey-guess.root+12)%12;
  const targetChords = useMemo(()=>chords.map(chord=>({...chord,root:(chord.root+shift)%12})),[chords,shift]);
  const options = useMemo(()=>targetChords.length?capoOptions(targetChords,targetKey,5):[],[targetChords,targetKey]);
  const selected = options.find(option=>option.capo===selectedCapo) || options[0];
  const selectedScale = scaleNotes(targetKey,fretMode);

  useEffect(()=>{
    try { setSavedSongs(JSON.parse(localStorage.getItem('fretwise-songs')||'[]')); } catch {}
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
    if(search.trim().length<2){setCatalogSongs([]);setSearchState('idle');setCatalogProvider('starter library');return}
    const controller=new AbortController(); const timer=setTimeout(async()=>{setSearchState('searching');try{const response=await fetch(`/api/catalog/search?q=${encodeURIComponent(search)}`,{signal:controller.signal});const data=await response.json() as {tracks:CatalogSong[];provider:string};setCatalogSongs(data.tracks||[]);setCatalogProvider(data.provider==='spotify'?'Spotify catalog':data.provider==='itunes'?'Apple Music catalog':data.provider==='musicbrainz'?'MusicBrainz catalog':'catalog');}catch{}finally{setSearchState('done')}},350);
    return()=>{clearTimeout(timer);controller.abort()};
  },[search]);
  function analyze() { const parsed=parseProgression(progression); if(!parsed.length)return; setKnownKey(null); setAnalysisInput(progression); const next=detectKey(parsed); setTargetKey(next.root); setFretMode(next.mode); setSelectedCapo(0); }
  async function saveSong() {
    if(!analysisInput.trim())return;
    const next:SavedSong={id:Date.now(),title:songTitle||'Untitled progression',artist:selectedCatalog?.artist||'My library',progression:analysisInput,sourceKey:guess.root,mode:guess.mode,targetKey,capo:selected?.capo||0};
    const updated=[next,...savedSongs].slice(0,50); setSavedSongs(updated); localStorage.setItem('fretwise-songs',JSON.stringify(updated));
    const supabase=getSupabase(); if(userId&&supabase){
      if(selectedCatalog) await supabase.from('song_keys').insert({spotify_id:selectedCatalog.provider==='spotify'?selectedCatalog.id:null,itunes_id:selectedCatalog.provider==='itunes'?selectedCatalog.id:null,musicbrainz_id:selectedCatalog.provider==='musicbrainz'?selectedCatalog.id:null,isrc:selectedCatalog.isrc,title:selectedCatalog.title,artist:selectedCatalog.artist,album:selectedCatalog.album,key_root:guess.root,mode:guess.mode,progression:analysisInput,confidence:guess.confidence,source:'chord-analysis',created_by:userId});
      await supabase.from('saved_songs').insert({user_id:userId,title:next.title,artist:next.artist,progression:next.progression,source_key:next.sourceKey,mode:next.mode,target_key:targetKey,capo:next.capo});
    }
    setLibraryOpen(true);
  }
  function loadSong(song:{title:string;progression:string;artist?:string}) { setSelectedCatalog(null);setKnownKey(null);setSongTitle(song.title);setProgression(song.progression);setAnalysisInput(song.progression);const next=detectKey(parseProgression(song.progression));setTargetKey(next.root);setFretMode(next.mode);setLibraryOpen(false);document.querySelector('#transpose')?.scrollIntoView({behavior:'smooth'}); }
  function chooseCatalogSong(song:CatalogSong) { setSelectedCatalog(song);setSongTitle(song.title);setProgression(song.progression||'');setAnalysisInput(song.progression||'');const override=song.key!==null&&song.mode?{root:song.key,mode:song.mode,confidence:song.confidence||80}:null;setKnownKey(override);if(override){setTargetKey(override.root);setFretMode(override.mode)}document.querySelector('#transpose')?.scrollIntoView({behavior:'smooth'}); }
  async function sendMagicLink(){const supabase=getSupabase();if(!supabase){setAuthMessage('Add the Supabase settings to enable cloud sync.');return}const {error}=await supabase.auth.signInWithOtp({email:authEmail,options:{emailRedirectTo:window.location.origin}});setAuthMessage(error?error.message:'Check your email for the sign-in link.');}
  async function signOut(){await getSupabase()?.auth.signOut();setAuthMessage('Signed out. Your local songs stay on this device.');}
  function answerQuiz(pc:number) { const correct=noteAt(quiz.string,quiz.fret)===pc; setQuiz(current=>({...current,score:current.score+(correct?1:0),total:current.total+1,message:correct?'That’s it — nice work.':`That note is ${prettyNote(noteAt(current.string,current.fret),true)}.`,string:Math.floor(Math.random()*6),fret:Math.floor(Math.random()*13)})); }
  const keyName=prettyNote(guess.root,[0,1,3,5,8,10].includes(guess.root));
  const targetName=prettyNote(targetKey,[0,1,3,5,8,10].includes(targetKey));
  const visibleSongs=search.trim().length>=2?catalogSongs:STARTER_SONGS;

  return <main id="top">
    <header className="site-header"><a className="brand" href="#top"><span className="brand-mark">f</span><span>fretwise</span></a><nav><a className="nav-active" href="#transpose">Transpose</a><a href="#fretboard">Fretboard</a><a href="#practice">Practice</a></nav><button className="library-button" onClick={()=>setLibraryOpen(true)}>{userEmail?'Synced songs':'My songs'} <span>{savedSongs.length}</span></button></header>
    <section className="hero"><p className="eyebrow"><span/> Guitar theory that makes sense</p><h1>Play the song.<br/><em>Understand the music.</em></h1><p className="hero-copy">Find the key, get easier capo options, and see exactly where every note lives on your guitar.</p><a className="hero-link" href="#transpose">Start with a progression <span>↓</span></a></section>

    <section className="song-finder"><div><div><p className="step-label">SEARCH THE CATALOG</p><h2>Find a song or bring your own.</h2></div><span className="catalog-source">{searchState==='searching'?'Searching…':catalogProvider}</span></div><div className="song-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Song title — artist name" aria-label="Search songs"/></div><p className="search-tip">For the best match, include both the song and artist—for example, “Stand By Me — Ben E. King.”</p><div className="song-list catalog-results">{visibleSongs.slice(0,8).map((song,index)=>{const catalog='provider' in song;return <article key={`${song.title}-${index}`} className={catalog&&song.image?'has-art':''}>{catalog&&song.image&&<img src={song.image} alt=""/>}<button onClick={()=>catalog?chooseCatalogSong(song as CatalogSong):loadSong(song)}><b>{song.title}</b><span>{song.artist}</span>{catalog&&<small>{song.key!==null?`${prettyNote(song.key,true)} ${song.mode} · ${song.confidence}% confidence`:'Key not verified yet'}</small>}</button>{catalog&&song.url&&<a href={song.url} target="_blank" rel="noreferrer">Open in {song.provider==='itunes'?'Apple Music':'source'} ↗</a>}{!catalog&&'spotify' in song&&<a href={song.spotify} target="_blank" rel="noreferrer">Open in Spotify ↗</a>}</article>})}{searchState==='done'&&!visibleSongs.length&&<p className="empty-state">No match yet. Try adding the artist name.</p>}</div></section>

    <section className="workspace" id="transpose">
      <div className="workspace-heading"><div><p className="step-label">01 / ANALYZE</p><h2>{selectedCatalog?selectedCatalog.title:'What are you playing?'}</h2>{selectedCatalog&&<p className="selected-artist">{selectedCatalog.artist}{knownKey?' · verified key found':' · paste the chords to identify its key'}</p>}</div><span className="helper-text">Supports sharps, flats, sevenths, sus chords, and more</span></div>
      <div className="analyzer-grid"><div className="input-panel"><label htmlFor="progression">CHORDS</label><textarea id="progression" value={progression} onChange={e=>setProgression(e.target.value)} placeholder="Try: G  D  Em  C"/><div className="input-footer"><button onClick={analyze}>Analyze progression <span>→</span></button><span>Separate chords with spaces</span></div></div><aside className="result-panel"><p className="result-kicker">LIKELY CONCERT KEY</p><div className="key-result"><strong>{keyName}</strong><span>{guess.mode}</span><i>{guess.confidence}% match</i></div><div className="wood-rule"/><p className="result-summary">The harmonic pattern is<br/><b>{guess.roman.join(' · ')||'Add some chords'}</b></p></aside></div>
      <div className="transpose-bar"><div><span>ORIGINAL KEY</span><b>{keyName} {guess.mode}</b></div><span className="long-arrow">→</span><label><span>MAKE IT SOUND IN</span><select value={targetKey} onChange={e=>{setTargetKey(Number(e.target.value));setSelectedCapo(0)}}>{KEY_OPTIONS.map(key=><option key={key.value} value={key.value}>{key.label} {guess.mode}</option>)}</select></label><div className="final-chords"><span>TRANSPOSED CHORDS</span><b>{targetChords.map(chord=>transposeChord(chord,0,[0,1,3,5,8,10].includes(targetKey))).join('  ·  ')}</b></div></div>
      <div className="options-heading"><div><p className="step-label">02 / CHOOSE YOUR SHAPES</p><h3>Same sound, friendlier shapes.</h3></div><p>Every option still sounds in {targetName} {guess.mode}.</p></div>
      {options.length?<div className="option-grid">{options.slice(0,3).map((option,index)=><article className={`capo-card ${index===0?'best':''} ${selected?.capo===option.capo?'selected':''}`} key={option.capo}>{index===0&&<div className="recommendation">BEST CHOICE</div>}<div className="capo-top"><span>PLAY IN</span><strong>{option.shapeKey}</strong><i>{guess.mode}</i></div><div className="capo-position"><span>CAPO</span><b>{option.capo||'—'}</b><small>{option.capo?`fret ${option.capo}`:'no capo'}</small></div><div className="chord-row">{option.chords.map((chord,i)=><span key={`${chord}-${i}`}>{chord}</span>)}</div><p className="option-reason">{option.reason}</p><button onClick={()=>setSelectedCapo(option.capo)}>{selected?.capo===option.capo?'Selected':'Use these chords'} <span>→</span></button></article>)}</div>:<div className="needs-chords"><b>{knownKey?`This recording is in ${keyName} ${guess.mode}.`:'We found the recording, but its key is not verified yet.'}</b><p>Paste its chords above and analyze them to unlock transposition and capo options.</p></div>}
      {options.length>3&&<details className="more-options"><summary>Show two more capo options</summary><div>{options.slice(3).map(option=><button key={option.capo} onClick={()=>setSelectedCapo(option.capo)}>Capo {option.capo}: play in {option.shapeKey} — {option.chords.join(' · ')}</button>)}</div></details>}
      {selected&&<section className="play-sheet"><div className="sheet-title"><div><p className="step-label">YOUR PLAYING SHEET</p><h3>{songTitle}</h3></div><button onClick={saveSong}>＋ {userId?'Save & sync':'Save to my songs'}</button></div><div className="sheet-meta"><span>Sounds in <b>{targetName} {guess.mode}</b></span><span>Play in <b>{selected.shapeKey} {guess.mode}</b></span><span>Capo <b>{selected.capo||'none'}</b></span></div><div className="large-chords">{selected.chords.map((chord,i)=><span key={`${chord}-${i}`}>{chord}<small>{guess.roman[i]}</small></span>)}</div><label className="song-name">Song name<input value={songTitle} onChange={e=>setSongTitle(e.target.value)}/></label></section>}
    </section>

    <section className="fret-section" id="fretboard"><div className="section-copy"><p className="step-label">03 / SEE THE NECK</p><h2>Every note has an address.</h2><p>Choose a key and see its scale across the first twelve frets. Root notes are shown in wood.</p><div className="scale-controls"><select value={targetKey} onChange={e=>setTargetKey(Number(e.target.value))}>{KEY_OPTIONS.map(key=><option key={key.value} value={key.value}>{key.label}</option>)}</select><button className={fretMode==='major'?'active':''} onClick={()=>setFretMode('major')}>Major</button><button className={fretMode==='minor'?'active':''} onClick={()=>setFretMode('minor')}>Minor</button></div><div className="legend"><span className="root-dot"/> Root note <span className="scale-dot"/> Scale note</div></div><div className="fretboard-wrap"><div className="fret-numbers"><span>OPEN</span>{Array.from({length:12},(_,i)=><span key={i}>{i+1}</span>)}</div><div className="fretboard">{Array.from({length:6},(_,string)=><div className="guitar-string" key={string}>{Array.from({length:13},(_,fret)=>{const note=noteAt(string,fret);const inScale=selectedScale.includes(note);return <span className={`${inScale?'in-scale':''} ${note===targetKey?'root-note':''}`} key={fret}>{inScale?prettyNote(note,[0,1,3,5,8,10].includes(targetKey)):''}</span>})}</div>)}</div><div className="string-names">E · B · G · D · A · E</div></div></section>

    <section className="practice-section" id="practice"><div><p className="step-label">04 / PRACTICE</p><h2>Learn it until you don’t have to think.</h2><p>A quick fretboard drill. The first string shown is the high E string.</p></div><div className="quiz-card"><div className="quiz-score"><span>SCORE</span><b>{quiz.score}/{quiz.total}</b></div><p>What note is on <b>string {quiz.string+1}</b>, <b>fret {quiz.fret}</b>?</p><div className="answer-grid">{KEY_OPTIONS.map(key=><button key={key.value} onClick={()=>answerQuiz(key.value)}>{key.label}</button>)}</div><small>{quiz.message}</small></div></section>
    <footer><a className="brand" href="#top"><span className="brand-mark">f</span><span>fretwise</span></a><p>Made for the moment between hearing a song and knowing how to play it.</p><a href="#top">Back to top ↑</a></footer>
    {libraryOpen&&<div className="modal-backdrop" onMouseDown={()=>setLibraryOpen(false)}><section className="library-modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setLibraryOpen(false)}>×</button><p className="step-label">MY LIBRARY</p><h2>Saved songs</h2><div className="sync-box">{userEmail?<><div><b>Synced as {userEmail}</b><span>Your library follows you across devices.</span></div><button onClick={signOut}>Sign out</button></>:<><div><b>Sync phone + laptop</b><span>Enter your email and we’ll send a secure sign-in link.</span></div><div className="auth-row"><input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@example.com"/><button onClick={sendMagicLink}>Send link</button></div></>}{authMessage&&<small>{authMessage}</small>}</div>{savedSongs.length?<div className="saved-list">{savedSongs.map(song=><button key={song.id} onClick={()=>loadSong(song)}><b>{song.title}</b><span>{prettyNote(song.sourceKey,true)} {song.mode} · {song.progression}</span></button>)}</div>:<div className="empty-library"><b>Your songbook is waiting.</b><p>Analyze a progression and save it here. Without sign-in it stays only on this device.</p></div>}</section></div>}
  </main>;
}
