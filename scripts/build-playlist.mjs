// Runs on every Netlify deploy: reads the Spotify playlist, saves every cover into /covers at 300 and 640px,
// and writes /playlist.json. The page then loads the wall from the site itself, with no wait on Spotify.
// It never fails the deploy: if Spotify cannot be reached, the page falls back to /api/playlist.
import { mkdir, writeFile } from "node:fs/promises"
import { readPlaylist, sized, imageKey } from "../netlify/lib/spotify.mjs"

async function save(url, file) {
  try {
    const r = await fetch(url)
    if (!r.ok) return false
    await writeFile(file, Buffer.from(await r.arrayBuffer()))
    return true
  } catch { return false }
}

try {
  const tracks = await readPlaylist()
  if (!tracks.length) throw new Error("no tracks")
  await mkdir("covers", { recursive: true })
  const done = new Map()
  for (const t of tracks) {
    const key = imageKey(t.cover)
    if (!key) continue
    if (!done.has(key)) {
      const small = await save(sized(t.cover, 300), `covers/${key}-300.jpg`)
      const big = await save(sized(t.cover, 640), `covers/${key}-640.jpg`)
      done.set(key, small && big)
    }
    if (done.get(key)) { t.cover = `/covers/${key}-640.jpg`; t.cover300 = `/covers/${key}-300.jpg` }
  }
  await writeFile("playlist.json", JSON.stringify({ built: new Date().toISOString(), tracks }))
  console.log(`playlist.json: ${tracks.length} songs, ${done.size} covers`)
} catch (e) {
  console.log("Playlist not built, the site will use /api/playlist instead:", e.message)
}
