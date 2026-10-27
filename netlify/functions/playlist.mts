// Live fallback for the cover wall: the site normally uses playlist.json made at build time,
// and asks this function only if that file is missing. The CDN keeps the answer for a day.
import { readPlaylist } from "../lib/spotify.mjs"

export default async () => {
  const tracks = await readPlaylist()
  if (!tracks.length) return Response.json({ tracks: [], error: "could not read the playlist from Spotify" }, { status: 502 })
  return Response.json({ tracks }, {
    headers: {
      "cache-control": "public, max-age=300",
      "netlify-cdn-cache-control": "public, s-maxage=86400, stale-while-revalidate=604800"
    }
  })
}

export const config = { path: "/api/playlist" }
