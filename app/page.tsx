'use client';

import { useEffect, useMemo, useState } from 'react';
import { KEY_OPTIONS, capoOptions, detectKey, noteAt, parseProgression, prettyNote, scaleNotes, transposeChord } from '@/lib/music';

type SavedSong = { id:number; title:string; artist:string; progression:string; sourceKey:number; mode:'major'|'minor' };
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
  const [quiz,setQuiz] = useState({ string:5, fret:3, score:0, total:0, message:'Find the note, then check your answer.' });
  const chords = useMemo(()=>parseProgression(analysisInput),[analysisInput]);
  const guess = useMemo(()=>detectKey(chords),[chords]);
  const shift = (targetKey-guess.root+12)%12;
  const targetChords = useMemo(()=>chords.map(chord=>({...chord,root:(chord.root+shift)%12})),[chords,shift]);
  const options = useMemo(()=>capoOptions(targetChords,targetKey,5),[targetChords,targetKey]);
  const selected = options.find(option=>option.capo===selectedCapo) || options[0];
  const selectedScale = scaleNotes(targetKey,fretMode);

  useEffect(()=>{ try { setSavedSongs(JSON.parse(localStorage.getItem('fretwise-songs')||'[]')); } catch {} },[]);
  function analyze() { const parsed=parseProgression(progression); if(!parsed.length)return; setAnalysisInput(progression); const next=detectKey(parsed); setTargetKey(next.root); setFretMode(next.mode); setSelectedCapo(0); }
  function saveSong() { const next:SavedSong={id:Date.now(),title:songTitle||'Untitled progression',artist:'My library',progression:analysisInput,sourceKey:guess.root,mode:guess.mode}; const updated=[next,...savedSongs].slice(0,30); setSavedSongs(updated); localStorage.setItem('fretwise-songs',JSON.stringify(updated)); setLibraryOpen(true); }
  function loadSong(song:{title:string;progression:string}) { setSongTitle(song.title); setProgression(song.progression); setAnalysisInput(song.progression); const next=detectKey(parseProgression(song.progression)); setTargetKey(next.root); setFretMode(next.mode); setLibraryOpen(false); document.querySelector('#transpose')?.scrollIntoView({behavior:'smooth'}); }
  function answerQuiz(pc:number) { const correct=noteAt(quiz.string,quiz.fret)===pc; setQuiz(current=>({...current,score:current.score+(correct?1:0),total:current.total+1,message:correct?'That’s it — nice work.':`That note is ${prettyNote(noteAt(current.string,current.fret),true)}.`,string:Math.floor(Math.random()*6),fret:Math.floor(Math.random()*13)})); }
  const keyName=prettyNote(guess.root,[0,1,3,5,8,10].includes(guess.root));
  const targetName=prettyNote(targetKey,[0,1,3,5,8,10].includes(targetKey));
  const filteredSongs=[...STARTER_SONGS,...savedSongs].filter(song=>`${song.title} ${song.artist}`.toLowerCase().includes(search.toLowerCase()));

  return <main id="top">
    <header className="site-header"><a className="brand" href="#top"><span className="brand-mark">f</span><span>fretwise</span></a><nav><a className="nav-active" href="#transpose">Transpose</a><a href="#fretboard">Fretboard</a><a href="#practice">Practice</a></nav><button className="library-button" onClick={()=>setLibraryOpen(true)}>My songs <span>{savedSongs.length}</span></button></header>
    <section className="hero"><p className="eyebrow"><span/> Guitar theory that makes sense</p><h1>Play the song.<br/><em>Understand the music.</em></h1><p className="hero-copy">Find the key, get easier capo options, and see exactly where every note lives on your guitar.</p><a className="hero-link" href="#transpose">Start with a progression <span>↓</span></a></section>

    <section className="song-finder"><div><p className="step-label">SONG STARTERS</p><h2>Find a song or bring your own.</h2></div><div className="song-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your library and starter songs" aria-label="Search songs"/></div><div className="song-list">{filteredSongs.slice(0,4).map((song,index)=><article key={`${song.title}-${index}`}><button onClick={()=>loadSong(song)}><b>{song.title}</b><span>{song.artist}</span></button>{'spotify' in song&&<a href={song.spotify} target="_blank" rel="noreferrer">Open in Spotify ↗</a>}</article>)}{!filteredSongs.length&&<p className="empty-state">No match yet. Paste its chords below and save it to your library.</p>}</div></section>

    <section className="workspace" id="transpose">
      <div className="workspace-heading"><div><p className="step-label">01 / ANALYZE</p><h2>What are you playing?</h2></div><span className="helper-text">Supports sharps, flats, sevenths, sus chords, and more</span></div>
      <div className="analyzer-grid"><div className="input-panel"><label htmlFor="progression">CHORDS</label><textarea id="progression" value={progression} onChange={e=>setProgression(e.target.value)} placeholder="Try: G  D  Em  C"/><div className="input-footer"><button onClick={analyze}>Analyze progression <span>→</span></button><span>Separate chords with spaces</span></div></div><aside className="result-panel"><p className="result-kicker">LIKELY CONCERT KEY</p><div className="key-result"><strong>{keyName}</strong><span>{guess.mode}</span><i>{guess.confidence}% match</i></div><div className="wood-rule"/><p className="result-summary">The harmonic pattern is<br/><b>{guess.roman.join(' · ')||'Add some chords'}</b></p></aside></div>
      <div className="transpose-bar"><div><span>ORIGINAL KEY</span><b>{keyName} {guess.mode}</b></div><span className="long-arrow">→</span><label><span>MAKE IT SOUND IN</span><select value={targetKey} onChange={e=>{setTargetKey(Number(e.target.value));setSelectedCapo(0)}}>{KEY_OPTIONS.map(key=><option key={key.value} value={key.value}>{key.label} {guess.mode}</option>)}</select></label><div className="final-chords"><span>TRANSPOSED CHORDS</span><b>{targetChords.map(chord=>transposeChord(chord,0,[0,1,3,5,8,10].includes(targetKey))).join('  ·  ')}</b></div></div>
      <div className="options-heading"><div><p className="step-label">02 / CHOOSE YOUR SHAPES</p><h3>Same sound, friendlier shapes.</h3></div><p>Every option still sounds in {targetName} {guess.mode}.</p></div>
      <div className="option-grid">{options.slice(0,3).map((option,index)=><article className={`capo-card ${index===0?'best':''} ${selected?.capo===option.capo?'selected':''}`} key={option.capo}>{index===0&&<div className="recommendation">BEST CHOICE</div>}<div className="capo-top"><span>PLAY IN</span><strong>{option.shapeKey}</strong><i>{guess.mode}</i></div><div className="capo-position"><span>CAPO</span><b>{option.capo||'—'}</b><small>{option.capo?`fret ${option.capo}`:'no capo'}</small></div><div className="chord-row">{option.chords.map((chord,i)=><span key={`${chord}-${i}`}>{chord}</span>)}</div><p className="option-reason">{option.reason}</p><button onClick={()=>setSelectedCapo(option.capo)}>{selected?.capo===option.capo?'Selected':'Use these chords'} <span>→</span></button></article>)}</div>
      <details className="more-options"><summary>Show two more capo options</summary><div>{options.slice(3).map(option=><button key={option.capo} onClick={()=>setSelectedCapo(option.capo)}>Capo {option.capo}: play in {option.shapeKey} — {option.chords.join(' · ')}</button>)}</div></details>
      <section className="play-sheet"><div className="sheet-title"><div><p className="step-label">YOUR PLAYING SHEET</p><h3>{songTitle}</h3></div><button onClick={saveSong}>＋ Save to my songs</button></div><div className="sheet-meta"><span>Sounds in <b>{targetName} {guess.mode}</b></span><span>Play in <b>{selected?.shapeKey} {guess.mode}</b></span><span>Capo <b>{selected?.capo||'none'}</b></span></div><div className="large-chords">{selected?.chords.map((chord,i)=><span key={`${chord}-${i}`}>{chord}<small>{guess.roman[i]}</small></span>)}</div><label className="song-name">Song name<input value={songTitle} onChange={e=>setSongTitle(e.target.value)}/></label></section>
    </section>

    <section className="fret-section" id="fretboard"><div className="section-copy"><p className="step-label">03 / SEE THE NECK</p><h2>Every note has an address.</h2><p>Choose a key and see its scale across the first twelve frets. Root notes are shown in wood.</p><div className="scale-controls"><select value={targetKey} onChange={e=>setTargetKey(Number(e.target.value))}>{KEY_OPTIONS.map(key=><option key={key.value} value={key.value}>{key.label}</option>)}</select><button className={fretMode==='major'?'active':''} onClick={()=>setFretMode('major')}>Major</button><button className={fretMode==='minor'?'active':''} onClick={()=>setFretMode('minor')}>Minor</button></div><div className="legend"><span className="root-dot"/> Root note <span className="scale-dot"/> Scale note</div></div><div className="fretboard-wrap"><div className="fret-numbers"><span>OPEN</span>{Array.from({length:12},(_,i)=><span key={i}>{i+1}</span>)}</div><div className="fretboard">{Array.from({length:6},(_,string)=><div className="guitar-string" key={string}>{Array.from({length:13},(_,fret)=>{const note=noteAt(string,fret);const inScale=selectedScale.includes(note);return <span className={`${inScale?'in-scale':''} ${note===targetKey?'root-note':''}`} key={fret}>{inScale?prettyNote(note,[0,1,3,5,8,10].includes(targetKey)):''}</span>})}</div>)}</div><div className="string-names">E · B · G · D · A · E</div></div></section>

    <section className="practice-section" id="practice"><div><p className="step-label">04 / PRACTICE</p><h2>Learn it until you don’t have to think.</h2><p>A quick fretboard drill. The first string shown is the high E string.</p></div><div className="quiz-card"><div className="quiz-score"><span>SCORE</span><b>{quiz.score}/{quiz.total}</b></div><p>What note is on <b>string {quiz.string+1}</b>, <b>fret {quiz.fret}</b>?</p><div className="answer-grid">{KEY_OPTIONS.map(key=><button key={key.value} onClick={()=>answerQuiz(key.value)}>{key.label}</button>)}</div><small>{quiz.message}</small></div></section>
    <footer><a className="brand" href="#top"><span className="brand-mark">f</span><span>fretwise</span></a><p>Made for the moment between hearing a song and knowing how to play it.</p><a href="#top">Back to top ↑</a></footer>
    {libraryOpen&&<div className="modal-backdrop" onMouseDown={()=>setLibraryOpen(false)}><section className="library-modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setLibraryOpen(false)}>×</button><p className="step-label">MY LIBRARY</p><h2>Saved songs</h2>{savedSongs.length?<div className="saved-list">{savedSongs.map(song=><button key={song.id} onClick={()=>loadSong(song)}><b>{song.title}</b><span>{prettyNote(song.sourceKey,true)} {song.mode} · {song.progression}</span></button>)}</div>:<div className="empty-library"><b>Your songbook is waiting.</b><p>Analyze a progression and tap “Save to my songs.” It stays on this device.</p></div>}</section></div>}
  </main>;
}
