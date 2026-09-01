import { NextRequest, NextResponse } from 'next/server';

type CatalogTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  image: string | null;
  url: string | null;
  isrc: string | null;
  provider: 'spotify' | 'itunes' | 'musicbrainz';
  key: number | null;
  mode: 'major' | 'minor' | null;
  confidence: number | null;
  progression: string | null;
};

type ITunesItem = { kind?:string; trackId:number|string; trackName:string; artistName:string; collectionName?:string; artworkUrl100?:string; trackViewUrl?:string };
type SpotifyArtist = { name:string };
type SpotifyItem = { id:string; name:string; artists?:SpotifyArtist[]; album?:{name?:string;images?:Array<{url:string}>}; external_urls?:{spotify?:string}; external_ids?:{isrc?:string} };
type MusicBrainzItem = { id:string; title:string; 'artist-credit'?:Array<{name:string}>; releases?:Array<{title:string}>; isrcs?:string[] };

async function knownKeys(tracks: CatalogTrack[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !tracks.length) return tracks;
  const spotifyIds = tracks.filter(track => track.provider === 'spotify').map(track => track.id);
  const itunesIds = tracks.filter(track => track.provider === 'itunes').map(track => track.id);
  const isrcs = tracks.map(track => track.isrc).filter(Boolean) as string[];
  const filters = [spotifyIds.length ? `spotify_id.in.(${spotifyIds.join(',')})` : '', itunesIds.length ? `itunes_id.in.(${itunesIds.join(',')})` : '', isrcs.length ? `isrc.in.(${isrcs.join(',')})` : ''].filter(Boolean).join(',');
  if (!filters) return tracks;
  try {
    const response = await fetch(`${url}/rest/v1/song_keys?select=spotify_id,itunes_id,isrc,key_root,mode,confidence,progression&or=(${encodeURIComponent(filters)})`, { headers: { apikey:key, Authorization:`Bearer ${key}` } });
    if (!response.ok) return tracks;
    const rows = await response.json() as Array<{spotify_id:string|null;itunes_id:string|null;isrc:string|null;key_root:number;mode:'major'|'minor';confidence:number;progression:string|null}>;
    return tracks.map(track => {
      const row = rows.find(item => (item.spotify_id && item.spotify_id === track.id) || (item.itunes_id && item.itunes_id === track.id) || (item.isrc && item.isrc === track.isrc));
      return row ? {...track,key:row.key_root,mode:row.mode,confidence:row.confidence,progression:row.progression} : track;
    });
  } catch { return tracks; }
}

function normalize(value:string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function rankTracks(tracks:CatalogTrack[],query:string) {
  const cleanQuery=normalize(query);
  const tokens=cleanQuery.split(' ').filter(token=>token.length>1);
  const unwanted=['cover','karaoke','tribute','remix','remastered','live','instrumental','sped up','slowed','re recorded'];
  const scored=tracks.map((track,index)=>{
    const title=normalize(track.title); const artist=normalize(track.artist); const album=normalize(track.album); const combined=`${title} ${artist} ${album}`;
    const coverage=tokens.filter(token=>combined.includes(token)).length/Math.max(tokens.length,1);
    let score=coverage*100-index*.35;
    if(title===cleanQuery)score+=45;
    if(cleanQuery.startsWith(`${title} `)){
      score+=20;
      const likelyArtist=cleanQuery.slice(title.length).trim();
      if(likelyArtist.length>1&&artist.includes(likelyArtist))score+=55;
    }
    if(cleanQuery.endsWith(` ${title}`))score+=20;
    for(const term of unwanted)if(!cleanQuery.includes(term)&&combined.includes(term))score-=38;
    return {track,score};
  }).sort((a,b)=>b.score-a.score);
  const seen=new Set<string>();
  return scored.filter(({track})=>{const signature=`${normalize(track.title)}|${normalize(track.artist)}`;if(seen.has(signature))return false;seen.add(signature);return true}).slice(0,8).map(item=>item.track);
}

async function searchITunes(query:string): Promise<CatalogTrack[]> {
  const response=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=US&media=music&entity=song&limit=30&explicit=Yes`,{headers:{Accept:'application/json'}});
  if(!response.ok)return [];
  const data=await response.json() as {results?:ITunesItem[]};
  const tracks:CatalogTrack[]=(data.results||[]).filter(item=>item.kind==='song').map(item=>({
    id:String(item.trackId),title:item.trackName,artist:item.artistName,album:item.collectionName||'',image:item.artworkUrl100?.replace('100x100','300x300')||null,url:item.trackViewUrl||null,isrc:null,provider:'itunes',key:null,mode:null,confidence:null,progression:null,
  }));
  return knownKeys(rankTracks(tracks,query));
}

async function searchSpotify(query:string): Promise<CatalogTrack[] | null> {
  const clientId=process.env.SPOTIFY_CLIENT_ID;
  const clientSecret=process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const tokenResponse=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{Authorization:`Basic ${btoa(`${clientId}:${clientSecret}`)}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  if (!tokenResponse.ok) return null;
  const {access_token}=await tokenResponse.json() as {access_token:string};
  const response=await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=8`,{headers:{Authorization:`Bearer ${access_token}`}});
  if (!response.ok) return null;
  const data=await response.json() as {tracks?:{items?:SpotifyItem[]}};
  const rawItems=data.tracks?.items || [];
  const tracks:CatalogTrack[]=rawItems.filter(Boolean).map(item=>({
    id:item.id,title:item.name,artist:item.artists?.map(artist=>artist.name).join(', ')||'Unknown artist',album:item.album?.name||'',image:item.album?.images?.[1]?.url||item.album?.images?.[0]?.url||null,url:item.external_urls?.spotify||null,isrc:item.external_ids?.isrc||null,provider:'spotify',key:null,mode:null,confidence:null,progression:null,
  }));
  return knownKeys(tracks);
}

async function searchMusicBrainz(query:string): Promise<CatalogTrack[]> {
  const response=await fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&limit=8&fmt=json`,{headers:{'User-Agent':'Fretwise/1.0 (https://github.com/AsinNinja123/guitar_tool)','Accept':'application/json'}});
  if (!response.ok) return [];
  const data=await response.json() as {recordings?:MusicBrainzItem[]};
  const tracks:CatalogTrack[]=(data.recordings||[]).map(item=>({
    id:item.id,title:item.title,artist:item['artist-credit']?.map(credit=>credit.name).join(', ')||'Unknown artist',album:item.releases?.[0]?.title||'',image:null,url:`https://musicbrainz.org/recording/${item.id}`,isrc:item.isrcs?.[0]||null,provider:'musicbrainz',key:null,mode:null,confidence:null,progression:null,
  }));
  return knownKeys(tracks);
}

export async function GET(request:NextRequest) {
  const query=request.nextUrl.searchParams.get('q')?.trim();
  if (!query || query.length<2) return NextResponse.json({tracks:[],provider:'none'});
  try {
    const spotify=await searchSpotify(query);
    if (spotify?.length) return NextResponse.json({tracks:spotify,provider:'spotify'});
    const itunes=await searchITunes(query);
    if (itunes.length) return NextResponse.json({tracks:itunes,provider:'itunes'});
    return NextResponse.json({tracks:await searchMusicBrainz(query),provider:'musicbrainz'});
  } catch { return NextResponse.json({tracks:[],provider:'unavailable'},{status:200}); }
}
