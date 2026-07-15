#!/usr/bin/env python3
"""Placeholder frame sequence for the ABYSSAL descent scrubber.

Renders a procedural 300-frame dive (surface -> sunlit -> twilight ->
midnight -> the floor) so the site pipeline can be built and verified
before the real Seedance clips are generated. Output format (frames +
manifest.json) is identical to what tools/build_frames.sh produces from
the real footage.
"""
import json
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 720
N = 300
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "frames")

# water colour ramp: (t, top rgb, bottom rgb)
STOPS = [
    (0.00, (52, 132, 186), (14, 70, 122)),
    (0.20, (20, 88, 148), (7, 44, 92)),
    (0.40, (9, 40, 84), (3, 17, 44)),
    (0.60, (2, 9, 24), (1, 3, 11)),
    (0.80, (1, 3, 9), (0, 1, 5)),
    (1.00, (1, 2, 6), (0, 0, 2)),
]

rng = random.Random(7)
BUBBLES = [(rng.random(), rng.random(), rng.uniform(1.5, 4.5), rng.uniform(0.6, 1.6)) for _ in range(70)]
SNOW = [(rng.random(), rng.random(), rng.uniform(0.6, 1.8), rng.uniform(0.15, 0.5)) for _ in range(140)]
SPARKS = [(rng.random(), rng.random(), rng.uniform(0.8, 2.2), rng.uniform(0, math.tau),
           rng.choice([(0, 229, 255), (0, 229, 255), (150, 90, 255)])) for _ in range(170)]
JELLIES = [(rng.random(), rng.uniform(0.15, 0.8), rng.uniform(18, 46), rng.uniform(0, math.tau)) for _ in range(7)]
CHIMNEYS = [(rng.uniform(0.03, 0.97), rng.uniform(0.35, 1.0), rng.uniform(24, 70)) for _ in range(9)]


def lerp(a, b, u):
    return a + (b - a) * u


def ramp(t):
    for i in range(len(STOPS) - 1):
        t0, top0, bot0 = STOPS[i]
        t1, top1, bot1 = STOPS[i + 1]
        if t0 <= t <= t1:
            u = (t - t0) / (t1 - t0)
            top = [lerp(top0[k], top1[k], u) for k in range(3)]
            bot = [lerp(bot0[k], bot1[k], u) for k in range(3)]
            return top, bot
    return list(STOPS[-1][1]), list(STOPS[-1][2])


def water(t):
    top, bot = ramp(t)
    y = np.linspace(0, 1, H)[:, None, None]
    img = (1 - y) * np.array(top)[None, None, :] + y * np.array(bot)[None, None, :]
    img = np.repeat(img, W, axis=1)
    return img  # float HxWx3


def draw_sub(dr, glow, t, cx, cy):
    """Side-profile Triton-X: black teardrop hull, cyan viewport ring, floodlights."""
    L, Hh = 240, 72  # hull length/height
    nose = (cx + L * 0.5, cy)
    hull = [
        (cx - L * 0.52, cy - Hh * 0.18), (cx - L * 0.30, cy - Hh * 0.46),
        (cx + L * 0.10, cy - Hh * 0.50), (cx + L * 0.38, cy - Hh * 0.34),
        (nose[0], cy - Hh * 0.06), (nose[0], cy + Hh * 0.06),
        (cx + L * 0.38, cy + Hh * 0.34), (cx + L * 0.10, cy + Hh * 0.50),
        (cx - L * 0.30, cy + Hh * 0.46), (cx - L * 0.52, cy + Hh * 0.18),
    ]
    dr.polygon(hull, fill=(4, 7, 11, 255))
    # dorsal fin
    dr.polygon([(cx - L * 0.05, cy - Hh * 0.48), (cx + L * 0.06, cy - Hh * 0.78),
                (cx + L * 0.16, cy - Hh * 0.48)], fill=(4, 7, 11, 255))
    # faint hull rim light
    dr.line(hull + [hull[0]], fill=(30, 70, 90, 120), width=2)
    # viewport ring (front third)
    vx, vy, r = cx + L * 0.22, cy - Hh * 0.02, Hh * 0.30
    ring_on = 1.0 if t < 0.42 else (0.0 if t < 0.50 else 1.0)
    if 0.50 <= t < 0.56:  # flicker on
        ring_on = 0.5 + 0.5 * math.sin(t * 900)
    a = int(230 * max(0.25, ring_on))
    for rr, aa in [(r + 7, a // 5), (r + 4, a // 3), (r + 2, a // 2), (r, a)]:
        dr.ellipse([vx - rr, vy - rr, vx + rr, vy + rr], outline=(0, 229, 255, aa), width=3)
    dr.ellipse([vx - r + 3, vy - r + 3, vx + r - 3, vy + r - 3], fill=(6, 16, 24, 255))
    glow.ellipse([vx - r - 12, vy - r - 12, vx + r + 12, vy + r + 12],
                 outline=(0, 229, 255, int(90 * max(0.25, ring_on))), width=8)
    # twin floodlights + beams (on below twilight flicker point)
    lights_on = 0.0 if t < 0.50 else (0.5 + 0.5 * math.sin(t * 900) if t < 0.56 else 1.0)
    for sy in (-1, 1):
        lx, ly = cx + L * 0.44, cy + sy * Hh * 0.26
        dr.ellipse([lx - 5, ly - 5, lx + 5, ly + 5],
                   fill=(220, 245, 255, int(80 + 175 * lights_on)))
        if lights_on > 0.05:
            sweep = math.sin(t * 24) * 30 if t > 0.82 else 0
            beam = [(lx, ly),
                    (lx + 430, ly + sy * 26 + sweep - 68),
                    (lx + 430, ly + sy * 26 + sweep + 68)]
            glow.polygon(beam, fill=(190, 235, 255, int(34 * lights_on)))


def render(i):
    t = i / (N - 1)
    base = water(t)

    img = Image.fromarray(base.astype(np.uint8), "RGB").convert("RGBA")
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(ov)
    gd = ImageDraw.Draw(gl)

    # --- clip 1: sky band sinks off the top as we submerge
    if t < 0.055:
        u = t / 0.055
        horizon = int(H * 0.30 * (1 - u) - 40 * u)
        if horizon > 0:
            sky = Image.new("RGBA", (W, horizon), (0, 0, 0, 0))
            sd = ImageDraw.Draw(sky)
            for y in range(horizon):
                v = y / max(1, horizon)
                sd.line([(0, y), (W, y)],
                        fill=(int(lerp(255, 120, v)), int(lerp(178, 160, v)), int(lerp(120, 190, v)), 255))
            ov.paste(sky, (0, 0))
            dr.line([(0, horizon), (W, horizon)], fill=(240, 250, 255, 180), width=3)

    # --- god rays (surface + sunlit)
    if t < 0.45:
        fade = 1 - t / 0.45
        for k in range(5):
            x0 = W * (0.08 + k * 0.21) + 30 * math.sin(t * 12 + k)
            gd.polygon([(x0, -20), (x0 + 46, -20), (x0 + 190, H), (x0 + 40, H)],
                       fill=(200, 235, 255, int(26 * fade)))

    # --- whale silhouette (sunlit zone)
    if 0.21 < t < 0.39:
        u = (t - 0.21) / 0.18
        wx, wy = W * (0.95 - 0.75 * u), H * 0.30
        body = [wx - 130, wy - 26, wx + 130, wy + 26]
        dr.ellipse(body, fill=(2, 12, 26, 110))
        dr.polygon([(wx - 128, wy), (wx - 185, wy - 30), (wx - 172, wy), (wx - 185, wy + 30)],
                   fill=(2, 12, 26, 110))

    # --- bubbles rising
    if t < 0.55:
        fade = 1 - max(0, (t - 0.35)) / 0.2
        for bx, by, r, sp in BUBBLES:
            y = (by - t * 6.0 * sp) % 1.2 - 0.1
            x = bx + 0.012 * math.sin(t * 30 + bx * 20)
            dr.ellipse([x * W - r, y * H - r, x * W + r, y * H + r],
                       outline=(225, 245, 255, int(110 * fade)), width=1)

    # --- marine snow (drifts up as we descend; stronger when deep)
    depth_a = min(1.0, max(0.0, (t - 0.25) / 0.3))
    for sx, sy, r, sp in SNOW:
        y = (sy - t * 3.0 * sp) % 1.1 - 0.05
        dr.ellipse([sx * W - r, y * H - r, sx * W + r, y * H + r],
                   fill=(200, 215, 230, int(70 * depth_a)))

    # --- jellyfish (twilight)
    if 0.40 < t < 0.63:
        u = (t - 0.40) / 0.23
        fade = math.sin(u * math.pi)
        for jx, jy, r, ph in JELLIES:
            x = (jx + 0.05 * math.sin(t * 8 + ph)) * W
            y = ((jy - u * 0.55 * (0.5 + jx)) % 1.0) * H
            pulse = 1 + 0.12 * math.sin(t * 60 + ph)
            rr = r * pulse
            dr.arc([x - rr, y - rr, x + rr, y + rr], 180, 360,
                   fill=(235, 210, 255, int(150 * fade)), width=3)
            dr.arc([x - rr * .7, y - rr * .5, x + rr * .7, y + rr * .9], 180, 360,
                   fill=(200, 180, 255, int(80 * fade)), width=2)
            for k in range(4):
                tx = x - rr * 0.6 + k * rr * 0.4
                dr.line([(tx, y), (tx + 6 * math.sin(t * 40 + k + ph), y + rr * 1.9)],
                        fill=(220, 200, 255, int(70 * fade)), width=1)

    # --- bioluminescent starfield (midnight)
    if 0.58 < t < 0.88:
        u = (t - 0.58) / 0.30
        fade = math.sin(min(1, u) * math.pi)
        for px, py, r, ph, col in SPARKS:
            tw = 0.5 + 0.5 * math.sin(t * 90 + ph)
            a = int(230 * fade * tw)
            if a < 12:
                continue
            x, y = px * W, ((py + 0.02 * math.sin(t * 15 + ph)) % 1.0) * H
            gd.ellipse([x - r, y - r, x + r, y + r], fill=(*col, a))

    # --- the floor: chimneys + vent shimmer
    if t > 0.78:
        u = (t - 0.78) / 0.22
        rise = u * u
        for cxx, chh, cw in CHIMNEYS:
            hpx = chh * 300 * rise
            x = cxx * W
            top = H - hpx
            dr.polygon([(x - cw, H), (x - cw * 0.35, top), (x + cw * 0.3, top + 8), (x + cw * 1.1, H)],
                       fill=(1, 4, 8, 255))
            if rise > 0.35:
                gd.ellipse([x - 10, top - 16, x + 10, top + 4],
                           fill=(255, 150, 60, int(36 * rise)))
                for k in range(5):
                    yy = top - 14 - k * 16 - (t * 700 % 16)
                    gd.ellipse([x - 2 + 3 * math.sin(t * 50 + k), yy - 2,
                                x + 2 + 3 * math.sin(t * 50 + k), yy + 2],
                               fill=(255, 190, 120, int(26 * rise)))
        # floor haze
        gd.rectangle([0, H - 70 * rise, W, H], fill=(10, 40, 55, int(50 * rise)))

    # --- the vessel (enters from above during clip 1, then holds centre; final hover)
    if t < 0.18:
        cy = H * lerp(0.16, 0.50, min(1, t / 0.18))
    else:
        cy = H * 0.50
    cy += 7 * math.sin(t * 34)
    cx = W * 0.42
    if t > 0.90:  # settle into hero hover, slightly larger presence
        cy = H * (0.50 - 0.06 * (t - 0.90) / 0.10)
    draw_sub(dr, gd, t, cx, cy)

    gl = gl.filter(ImageFilter.GaussianBlur(7))
    img = Image.alpha_composite(img, gl)
    img = Image.alpha_composite(img, ov)

    # vignette + grain
    arr = np.asarray(img.convert("RGB")).astype(np.int16)
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    vig = np.clip(1 - 0.38 * np.clip(d - 0.55, 0, None), 0, 1)
    arr = arr * vig[:, :, None]
    noise = np.random.default_rng(i).integers(-6, 7, (H, W, 1))
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def main():
    os.makedirs(OUT, exist_ok=True)
    for i in range(N):
        render(i).save(os.path.join(OUT, f"frame_{i:04d}.jpg"), quality=82)
        if i % 50 == 0:
            print(f"frame {i}/{N}")
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump({"count": N, "pattern": "assets/frames/frame_{index:04d}.jpg",
                   "width": W, "height": H, "placeholder": True}, f)
    print("done:", N, "frames ->", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
