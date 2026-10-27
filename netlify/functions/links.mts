// The same song on Apple Music, found through Odesli (song.link) from its Spotify id.
// Used when a visitor picks Apple Music in the player. Answers are cached for 30 days.
export default async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id") || ""
  if (!/^[A-Za-z0-9]{22}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 })
  let apple = ""
  try {
    const r = await fetch(`https://api.song.link/v1-alpha.1/links?userCountry=IL&url=${encodeURIComponent("https://open.spotify.com/track/" + id)}`)
    if (r.ok) apple = (await r.json())?.linksByPlatform?.appleMusic?.url || ""
  } catch {}
  return Response.json({ apple }, {
    headers: {
      "cache-control": "public, max-age=3600",
      "netlify-cdn-cache-control": apple ? "public, s-maxage=2592000" : "public, s-maxage=3600"
    }
  })
}

export const config = { path: "/api/links" }
