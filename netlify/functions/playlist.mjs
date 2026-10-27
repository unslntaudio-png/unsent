// Reads the public Spotify playlist and returns its tracks with cover art, for the cover wall on the home page.
// No Spotify API key needed: the track list comes from the playlist's public embed page,
// and each cover from Spotify's public oEmbed endpoint. Cached for a day at Netlify's edge.
const PLAYLIST = '1mg0TvIUJAOUPh5dPvkyiu';

export default async () => {
  try {
    const html = await (await fetch(`https://open.spotify.com/embed/playlist/${PLAYLIST}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' }
    })).text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) throw new Error('no data on embed page');
    // walk the page data and keep every object that looks like a track
    const found = new Map();
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (typeof o.uri === 'string' && o.uri.startsWith('spotify:track:') && (o.title || o.name)) {
        const id = o.uri.split(':')[2];
        if (!found.has(id)) found.set(id, {
          id,
          title: o.title || o.name,
          artist: o.subtitle || (o.artists || []).map(a => a.name).join(', '),
          duration: o.duration || o.duration_ms || 0
        });
      }
      for (const k in o) walk(o[k]);
    })(JSON.parse(m[1]));
    const tracks = [...found.values()];
    await Promise.all(tracks.map(async t => {
      try {
        const r = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${t.id}`);
        if (r.ok) t.cover = (await r.json()).thumbnail_url || '';
      } catch (e) {}
    }));
    return Response.json({ tracks }, { headers: { 'cache-control': 'public, max-age=300', 'netlify-cdn-cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch (e) {
    return Response.json({ tracks: [], error: String(e.message || e) }, { status: 502 });
  }
};

export const config = { path: '/api/playlist' };
