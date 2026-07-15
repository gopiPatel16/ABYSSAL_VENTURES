#!/usr/bin/env bash
# Build the scrub frame sequence from the 5 real Seedance clips.
# Usage: tools/build_frames.sh clip1.mp4 clip2.mp4 clip3.mp4 clip4.mp4 clip5.mp4
# Requires ffmpeg; if missing:  python3 -m pip install imageio-ffmpeg
#   then: export FFMPEG="$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FF="${FFMPEG:-ffmpeg}"
OUT="$ROOT/assets/frames"
FPS=8            # ~8 frames per second of source -> ~360 frames for 45s of footage
WIDTH=1280

[ $# -eq 5 ] || { echo "need exactly 5 clips in descent order"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

: > "$TMP/list.txt"
for f in "$@"; do
  printf "file '%s'\n" "$(cd "$(dirname "$f")" && pwd)/$(basename "$f")" >> "$TMP/list.txt"
done

"$FF" -y -f concat -safe 0 -i "$TMP/list.txt" -c copy "$ROOT/assets/video/descent_full.mp4" \
  || "$FF" -y -f concat -safe 0 -i "$TMP/list.txt" -c:v libx264 -preset fast -crf 18 -an "$ROOT/assets/video/descent_full.mp4"

rm -f "$OUT"/frame_*.jpg
"$FF" -y -i "$ROOT/assets/video/descent_full.mp4" \
  -vf "fps=$FPS,scale=$WIDTH:-2" -q:v 3 -start_number 0 "$OUT/frame_%04d.jpg"

COUNT=$(ls "$OUT"/frame_*.jpg | wc -l | tr -d ' ')
OUT_DIR="$OUT" W="$WIDTH" python3 - "$COUNT" <<'PY'
import json, sys, os
count = int(sys.argv[1])
with open(os.path.join(os.environ['OUT_DIR'], 'manifest.json'), 'w') as f:
    json.dump({"count": count, "pattern": "assets/frames/frame_{index:04d}.jpg",
               "width": int(os.environ.get('W', 1280)), "height": 720, "placeholder": False}, f)
print("manifest:", count, "frames")
PY
echo "done: $COUNT real frames"
