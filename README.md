# ABYSSAL VENTURES — cinematic scroll-dive site

Scrolling down IS diving down: the Triton-X's descent from the surface to the
ocean floor (0 → 3,800 m) with Lenis smooth scroll, a HUD depth meter on the
right edge, and sections pinned to each ocean zone.

## Run

```
python3 -m http.server 4173
# open http://localhost:4173
```

## Current visuals: the user's 3D submarine video, scroll-scrubbed

`index.html` loads `js/main-frames.js`, which scrubs 192 frames extracted
from `assets/video/descent_full.mp4` (the user-provided 8 s / 1280×720 / 24 fps
3D submarine animation). Because the footage stays sunlit throughout, the
renderer applies a scroll-driven canvas filter (`brightness` + `saturate`
falling across p 0.15→0.85) so the image dies to near-black by the midnight
zone, matching the site's depth narrative.

An alternative visual mode exists: `js/dive3d.js`, a real-time Three.js scene
(modeled Triton-X, orbiting camera, whale/jellyfish/bioluminescence/vents;
three vendored at `js/vendor/three.module.js`). Switch the `<script>` tag in
`index.html` between `main-frames.js` and `dive3d.js` to choose.
`tools/gen_placeholder_frames.py` regenerates procedural placeholder frames
if the video frames are removed.

## Replacing the footage (same pipeline works for AI clips)

The frame-scrub fallback is also the integration point for real generated
footage — five Seedance 2.0 clips (Higgsfield MCP, std / 1080p / 16:9 /
8–10 s, no audio), chained so each clip's final frame is the next clip's start
image, with one shared hero image of the Triton-X as an identity reference:

1. THE SURFACE — dawn aerial, the sub slips under, ends fully submerged
2. SUNLIT ZONE — god rays, bubbles, distant whale, blue deepens
3. TWILIGHT ZONE — light dies, jellyfish, floodlights + viewport ring flicker on
4. MIDNIGHT ZONE — bioluminescent starfield around the hull
5. THE FLOOR — hydrothermal vents, floodlight sweep, final hero hover

## Swapping in the real clips

```
tools/build_frames.sh clip1.mp4 clip2.mp4 clip3.mp4 clip4.mp4 clip5.mp4
```

Concatenates the clips into `assets/video/descent_full.mp4`, extracts JPEG
frames at 8 fps / 1280 px wide into `assets/frames/`, and rewrites
`manifest.json`. Requires ffmpeg (`python3 -m pip install imageio-ffmpeg` and
set `FFMPEG` if not installed). To ship the video version instead of the 3D
scene, point `index.html` at `js/main-frames.js` instead of `js/dive3d.js`.

## How the scrub stays in sync

- `js/main.js` maps scroll progress → frame index (lerped) and → depth via a
  piecewise curve anchored to the five clip fifths:
  0.2→10 m, 0.4→200 m, 0.6→1,000 m, 0.8→3,600 m, 1.0→3,800 m.
- Zone labels (SUNLIT / TWILIGHT / MIDNIGHT / THE FLOOR) switch at 200 / 1,000
  / 3,500 m, i.e. exactly at the clip joins.
- Section heights in `css/style.css` are tuned so each section's center lands
  inside its zone's fifth of the scroll — keep that if you edit copy length.
