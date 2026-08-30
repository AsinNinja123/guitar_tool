import { NextRequest, NextResponse } from 'next/server';

type CatalogTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  image: string | null;
  url: string | null;
  isrc: string | null;
  provider: 'spotify' | 'musicbrainz';
  key: number | null;
  mode: 'major' | 'minor' | null;
  confidence: number | null;
  progression: string | null;
};

async function knownKeys(tracks: CatalogTrack[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !tracks.length) return tracks;
  const spotifyIds = tracks.filter(track => track.provider === 'spotify').map(track => track.id);
  const isrcs = tracks.map(track => track.isrc).filter(Boolean) as string[];
  const filters = [spotifyIds.length ? `spotify_id.in.(${spotifyIds.join(',')})` : '', isrcs.length ? `isrc.in.(${isrcs.join(',')})` : ''].filter(Boolean).join(',');
  if (!filters) return tracks;
  try {
    const response = await fetch(`${url}/rest/v1/song_keys?select=spotify_id,isrc,key_root,mode,confidence,progression&or=(${encodeURIComponent(filters)})`, { headers: { apikey:key, Authorization:`Bearer ${key}` } });
    if (!response.ok) return tracks;
    const rows = await response.json() as Array<{spotify_id:string|null;isrc:string|null;key_root:number;mode:'major'|'minor';confidence:number;progression:string|null}>;
    return tracks.map(track => {
      const row = rows.find(item => (item.spotify_id && item.spotify_id === track.id) || (item.isrc && item.isrc === track.isrc));
      return row ? {...track,key:row.key_root,mode:row.mode,confidence:row.confidence,progression:row.progression} : track;
    });
  } catch { return tracks; }
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
  const data=await response.json() as any;
  const rawItems=data?.tracks?.items || data?.items?.items?.map((entry:any)=>entry.item) || [];
  const tracks:CatalogTrack[]=rawItems.filter(Boolean).map((item:any)=>({
    id:item.id,title:item.name,artist:item.artists?.map((artist:any)=>artist.name).join(', ')||'Unknown artist',album:item.album?.name||'',image:item.album?.images?.[1]?.url||item.album?.images?.[0]?.url||null,url:item.external_urls?.spotify||null,isrc:item.external_ids?.isrc||null,provider:'spotify',key:null,mode:null,confidence:null,progression:null,
  }));
  return knownKeys(tracks);
}

async function searchMusicBrainz(query:string): Promise<CatalogTrack[]> {
  const response=await fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&limit=8&fmt=json`,{headers:{'User-Agent':'Fretwise/1.0 (https://github.com/AsinNinja123/guitar_tool)','Accept':'application/json'}});
  if (!response.ok) return [];
  const data=await response.json() as any;
  const tracks:CatalogTrack[]=(data.recordings||[]).map((item:any)=>({
    id:item.id,title:item.title,artist:item['artist-credit']?.map((credit:any)=>credit.name).join(', ')||'Unknown artist',album:item.releases?.[0]?.title||'',image:null,url:`https://musicbrainz.org/recording/${item.id}`,isrc:item.isrcs?.[0]||null,provider:'musicbrainz',key:null,mode:null,confidence:null,progression:null,
  }));
  return knownKeys(tracks);
}

export async function GET(request:NextRequest) {
  const query=request.nextUrl.searchParams.get('q')?.trim();
  if (!query || query.length<2) return NextResponse.json({tracks:[],provider:'none'});
  try {
    const spotify=await searchSpotify(query);
    if (spotify?.length) return NextResponse.json({tracks:spotify,provider:'spotify'});
    return NextResponse.json({tracks:await searchMusicBrainz(query),provider:'musicbrainz'});
  } catch { return NextResponse.json({tracks:[],provider:'unavailable'},{status:200}); }
}
