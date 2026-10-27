// Reads the public Spotify playlist and returns its songs with cover art, for the cover wall on the home page.
// No Spotify API key: the track list comes from the playlist's public pages, and anything missing
// (artist, cover) from each song's public embed page or Spotify's oEmbed endpoint.
// The CDN keeps the answer for a day, so Spotify is asked at most about once a day.

const PLAYLIST = "1mg0TvIUJAOUPh5dPvkyiu"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

type Track = { id: string; title: string; artist: string; duration: number; cover: string }

async function page(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" } })
    return r.ok ? await r.text() : ""
  } catch { return "" }
}

function nextData(html: string): any {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  try { return m ? JSON.parse(m[1]) : null } catch { return null }
}

// the biggest image url found under an object (Spotify lists sizes as {url, width} or {url, maxWidth})
function bestImage(o: any): string {
  let best = "", size = -1
  ;(function walk(x: any) {
    if (!x || typeof x !== "object") return
    if (typeof x.url === "string" && /\/image\/ab67/.test(x.url)) {
      const w = x.width || x.maxWidth || 0
      if (w > size) { size = w; best = x.url }
    }
    for (const k in x) walk(x[k])
  })(o)
  return best
}

// the 640px version of a Spotify album image
const big = (u: string) => u.replace(/ab67616d0000(1e02|4851)/, "ab67616d0000b273")

// run jobs a few at a time so Spotify does not refuse a burst of requests
async function inBatches<T>(items: T[], size: number, job: (t: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(job))
}

export default async () => {
  const tracks = new Map<string, Track>()
  const add = (id: string, t: Partial<Track>) => {
    const cur: any = tracks.get(id) || { id, title: "", artist: "", duration: 0, cover: "" }
    for (const [k, v] of Object.entries(t)) if (v && !cur[k]) cur[k] = v
    tracks.set(id, cur)
  }

  // 1. the playlist's embed page carries the whole track list as JSON
  const embed = nextData(await page(`https://open.spotify.com/embed/playlist/${PLAYLIST}`))
  if (embed) (function walk(o: any) {
    if (!o || typeof o !== "object") return
    if (typeof o.uri === "string" && o.uri.startsWith("spotify:track:") && (o.title || o.name)) {
      add(o.uri.split(":")[2], {
        title: o.title || o.name,
        artist: o.subtitle || (o.artists || []).map((a: any) => a.name).join(", "),
        duration: o.duration || o.duration_ms || 0,
        cover: bestImage(o)
      })
    }
    for (const k in o) walk(o[k])
  })(embed)

  // 2. backup: the public playlist page links every song
  if (!tracks.size) {
    const html = await page(`https://open.spotify.com/playlist/${PLAYLIST}`)
    for (const m of html.matchAll(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/g)) add(m[1], {})
  }

  // 3. fill in what is missing from each song's own embed page, then oEmbed
  await inBatches([...tracks.values()], 4, async t => {
    if (!t.title || !t.artist || !t.cover) {
      const d = nextData(await page(`https://open.spotify.com/embed/track/${t.id}`))
      const e = d?.props?.pageProps?.state?.data?.entity
      if (e) add(t.id, {
        title: e.name || e.title,
        artist: (e.artists || []).map((a: any) => a.name).join(", ") || e.subtitle,
        duration: e.duration || 0,
        cover: bestImage(e)
      })
    }
    if (!t.cover || !t.title) {
      try {
        const r = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${t.id}`)
        if (r.ok) { const j = await r.json(); add(t.id, { title: j.title, cover: j.thumbnail_url }) }
      } catch {}
    }
  })

  const list = [...tracks.values()].filter(t => t.title).map(t => ({ ...t, cover: t.cover ? big(t.cover) : "" }))
  if (!list.length) return Response.json({ tracks: [], error: "could not read the playlist from Spotify" }, { status: 502 })
  return Response.json({ tracks: list }, {
    headers: {
      "cache-control": "public, max-age=300",
      "netlify-cdn-cache-control": "public, s-maxage=86400, stale-while-revalidate=604800"
    }
  })
}

export const config = { path: "/api/playlist" }
