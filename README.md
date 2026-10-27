# ROS-E

Website of the music producer Ros-e (Tom Rosenberg). Static site with no build step, deployed on Netlify.

- `index.html`: the whole page (HTML, CSS and JS). Editable content is in the `/* ===== EDIT HERE ===== */` block.
- `netlify/functions/playlist.mjs`: reads the Spotify playlist and returns its tracks and covers at `/api/playlist`, which fills the cover wall.
- `vendor/`: three.js 0.160.0, served locally, for the 3D logo.
