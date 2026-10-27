// Reads a public Spotify playlist without an API key: the track list comes from the playlist's public
// pages, and anything missing (artist, cover) from each song's embed page or Spotify's oEmbed endpoint.
// Shared by the build script (scripts/build-playlist.mjs) and the live fallback (netlify/functions/playlist.mts).

export const PLAYLIST = "1mg0TvIUJAOUPh5dPvkyiu"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

async function page(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" } })
    return r.ok ? await r.text() : ""
  } catch { return "" }
}

function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  try { return m ? JSON.parse(m[1]) : null } catch { return null }
}

// the biggest Spotify album image under an object (sizes come as {url, width} or {url, maxWidth})
function bestImage(o) {
  let best = "", size = -1
  ;(function walk(x) {
    if (!x || typeof x !== "object") return
    if (typeof x.url === "string" && /\/image\/ab67/.test(x.url)) {
      const w = x.width || x.maxWidth || 0
      if (w > size) { size = w; best = x.url }
    }
    for (const k in x) walk(x[k])
  })(o)
  return best
}

// Spotify keeps 64, 300 and 640px versions of an album image under the same id
export const sized = (u, w) => String(u || "").replace(/ab67616d0000(b273|1e02|4851)/, "ab67616d0000" + (w >= 640 ? "b273" : w >= 300 ? "1e02" : "4851"))
// the part of the image id that is the same for every size and every host
export const imageKey = u => (String(u).match(/ab67616d0000[0-9a-f]{4}([0-9a-f]{20,})/) || [])[1] || ""

async function inBatches(items, size, job) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(job))
}

export async function readPlaylist(id = PLAYLIST) {
  const tracks = new Map()
  const add = (tid, t) => {
    const cur = tracks.get(tid) || { id: tid, title: "", artist: "", duration: 0, cover: "" }
    for (const [k, v] of Object.entries(t)) if (v && !cur[k]) cur[k] = v
    tracks.set(tid, cur)
  }

  // 1. the playlist's embed page carries the track list as JSON
  const embed = nextData(await page(`https://open.spotify.com/embed/playlist/${id}`))
  if (embed) (function walk(o) {
    if (!o || typeof o !== "object") return
    if (typeof o.uri === "string" && o.uri.startsWith("spotify:track:") && (o.title || o.name)) {
      add(o.uri.split(":")[2], {
        title: o.title || o.name,
        artist: o.subtitle || (o.artists || []).map(a => a.name).join(", "),
        duration: o.duration || o.duration_ms || 0,
        cover: bestImage(o)
      })
    }
    for (const k in o) walk(o[k])
  })(embed)

  // 2. backup: the public playlist page links every song
  if (!tracks.size) {
    const html = await page(`https://open.spotify.com/playlist/${id}`)
    for (const m of html.matchAll(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/g)) add(m[1], {})
  }

  // 3. fill in what is missing from each song's own embed page, then oEmbed, a few songs at a time
  await inBatches([...tracks.values()], 4, async t => {
    if (!t.title || !t.artist || !t.cover) {
      const d = nextData(await page(`https://open.spotify.com/embed/track/${t.id}`))
      const e = d?.props?.pageProps?.state?.data?.entity
      if (e) add(t.id, {
        title: e.name || e.title,
        artist: (e.artists || []).map(a => a.name).join(", ") || e.subtitle,
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

  return [...tracks.values()].filter(t => t.title).map(t => ({ ...t, cover: t.cover ? sized(t.cover, 640) : "" }))
}
