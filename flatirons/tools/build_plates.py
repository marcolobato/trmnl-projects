#!/usr/bin/env python3
"""
flatirons/tools/build_plates.py

Regenerates every plate in images/flatirons/ from the original photograph and
flatirons/masks/zones.png.

One photograph, three zones, two dials:

    time of day   moves the zones TOGETHER   the sky carries the hour
    weather       moves them APART           sun on the peaks, shadow below

A single dial can only make the picture lighter or darker. Two dials is what
gives a day its character — the cloud-shadow look where the meadow falls into
shadow while the Flatirons stay lit.

    python3 flatirons/tools/build_plates.py /path/to/original.png
"""

import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

# The plate size. 780 matches the art area's width exactly.
#
# 420 is deliberately ~9px TALLER than the art area, which really measures
# 410.9 — the framework over-allocates by one --gap and flex shrinks .layout
# to absorb it. Do not "fix" this by setting H = 411:
#
#   - object-fit: cover picks max(780/780, 410.9/420) = exactly 1.0, so the
#     plate is drawn pixel-for-pixel and ~4.6px is trimmed top and bottom.
#     Nothing is resampled, which is the only thing that would hurt the
#     dither.
#   - 410.875 is fractional and only holds on the OG panel at --ui-scale 1.
#     It moves on any other device. A plate that slightly overfills is the
#     more robust of the two.
#
# See DECISIONS.md #14.
W, H = 780, 420

# Area averaging rather than bicubic. Bicubic sharpens as it shrinks, adding
# high-frequency energy the dither then has to fight. On this source the
# difference is small (8.76 vs 8.15 adjacent-pixel delta) but it costs nothing.
GEOM = f"format=gray,scale={W}:-2:flags=area,crop={W}:{H}"

# The eight flat greys every plate is quantized to.
TONES = [0, 36, 73, 109, 146, 182, 219, 255]

# ── Time of day ───────────────────────────────────────────────────────────
#
# Per zone: (brightness, contrast). Plus one gamma for the whole frame.
#
# The SKY carries the hour; the land holds roughly steady. That is how it
# works outdoors, and it is also what keeps ink coverage in range — this
# photograph's massif is dense timber and sits at 33-50% in every state, so
# it has no headroom to give. Darkening it as well as the sky put night at
# 79% ink, which reads as mud on reflective e-ink.
TIMES = {
    #          sky            massif         pasture        gamma
    "dawn":  ((-0.19, 1.00), ( 0.00, 1.10), (-0.08, 1.05), 1.00),
    "day":   (( 0.06, 1.00), ( 0.10, 1.05), ( 0.10, 1.05), 1.00),
    # Dusk sky was -0.05, which landed at 67.5% luminance against day's
    # 72.6% — five points apart, so a 6:43pm plate read as midday. Twilight
    # is mostly a SKY event; the land keeps its warmth longer than the sky
    # keeps its light. Sky drops hard, land lifts slightly to pay for the
    # ink the darker sky costs.
    "dusk":  ((-0.25, 1.05), (-0.02, 1.30), (-0.09, 1.20), 0.95),
    "night": ((-0.57, 0.90), ( 0.08, 1.10), ( 0.03, 1.00), 0.95),
}

# ── Weather ───────────────────────────────────────────────────────────────
#
# Deltas applied on top of the time-of-day values. The mountain gains
# contrast as the pasture falls into shadow — the two moving in opposite
# directions is the whole effect. Darkening the pasture alone just makes a
# flatter picture.
WEATHER = {
    #               sky_db  mtn_db  mtn_dc  pas_db
    "clear":       ( 0.00,  0.00,   1.00,   0.00),
    "sunbreak":    ( 0.03,  0.04,   1.12,  -0.22),
    "stormlight":  ( 0.06,  0.08,   1.20,  -0.32),
}

# How strongly weather registers at each hour.
#
# Cloud shadow is a SUNLIGHT phenomenon: it needs a sun to block. At night
# there is nothing to interrupt, so cloud cover means little more than fewer
# stars — dialling weather down to a third there keeps it from looking like
# an unexplained exposure change.
#
# It also protects the ink budget. Dawn and dusk already sit near 50%, so a
# full-strength stormlight would push them past the ceiling.
WEATHER_SCALE = {"dawn": 0.45, "day": 1.0, "dusk": 0.7, "night": 0.15}

# A frame too dark reads as mud on reflective e-ink; too light reads as a
# blank panel. Checked per plate at build time — cheaper to reject here than
# to find out on the wall three days later.
INK_MIN, INK_MAX = 0.25, 0.55


def run(args):
    subprocess.run(args, check=True, capture_output=True)


def gray_bytes(path):
    """Raw 8-bit luminance for an image, via ffmpeg."""
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path),
         "-vf", "format=gray", "-f", "rawvideo", "-"],
        check=True, capture_output=True).stdout


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: build_plates.py <original.png>")

    src = Path(sys.argv[1])
    root = Path(__file__).resolve().parents[2]
    mask_path = root / "flatirons" / "masks" / "zones.png"
    out_dir = root / "images" / "flatirons"
    out_dir.mkdir(parents=True, exist_ok=True)

    with TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        # ── Palette: 8 greys, padded to the 256 entries ffmpeg demands ────
        pal = b"".join(bytes([t, t, t]) * 32 for t in TONES)
        (tmp / "pal.ppm").write_bytes(b"P6\n16 16\n255\n" + pal)
        run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp / "pal.ppm"),
             str(tmp / "pal.png")])

        # ── Split the three-value mask into two binary masks ──────────────
        #
        # Feathered separately, because the boundaries are physically
        # different: rock against sky is a hard edge, forest against meadow
        # is not. One blur baked into the mask would force them to share a
        # value.
        raw = gray_bytes(mask_path)
        if len(raw) != W * H:
            sys.exit(f"mask is {len(raw)} bytes, expected {W * H}")

        for name, keep, sigma in (("sky", 0, 1.0), ("pas", 255, 2.0)):
            binary = bytes(255 if v == keep else 0 for v in raw)
            (tmp / f"m_{name}.pgm").write_bytes(
                b"P5\n%d %d\n255\n" % (W, H) + binary)
            run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp / f"m_{name}.pgm"),
                 "-vf", f"gblur=sigma={sigma}", str(tmp / f"m_{name}.png")])

        # ── Build every time x weather combination ────────────────────────
        print(f"building {len(TIMES) * len(WEATHER)} plates -> images/flatirons/\n")
        failures = []

        for time_name, (sky, mtn, pas, gamma) in TIMES.items():
            scale = WEATHER_SCALE[time_name]

            for wx_name, (sky_db, mtn_db, mtn_dc, pas_db) in WEATHER.items():
                zones = {
                    "sky": (sky[0] + sky_db * scale, sky[1]),
                    "mtn": (mtn[0] + mtn_db * scale, mtn[1] * (1 + (mtn_dc - 1) * scale)),
                    "pas": (pas[0] + pas_db * scale, pas[1]),
                }

                for z, (b, c) in zones.items():
                    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf",
                         f"{GEOM},eq=brightness={b:.4f}:contrast={c:.4f}:gamma={gamma}",
                         str(tmp / f"z_{z}.png")])

                # Massif is the base; sky painted over it, then pasture.
                run(["ffmpeg", "-v", "error", "-y",
                     "-i", str(tmp / "z_mtn.png"), "-i", str(tmp / "z_sky.png"),
                     "-i", str(tmp / "m_sky.png"),
                     "-lavfi", "[0:v][1:v][2:v]maskedmerge", str(tmp / "s1.png")])
                run(["ffmpeg", "-v", "error", "-y",
                     "-i", str(tmp / "s1.png"), "-i", str(tmp / "z_pas.png"),
                     "-i", str(tmp / "m_pas.png"),
                     "-lavfi", "[0:v][1:v][2:v]maskedmerge", str(tmp / "s2.png")])

                plate = out_dir / f"{time_name}-{wx_name}.png"
                run(["ffmpeg", "-v", "error", "-y",
                     "-i", str(tmp / "s2.png"), "-i", str(tmp / "pal.png"),
                     "-lavfi", "[0:v]format=rgb24[x];[x][1:v]"
                               "paletteuse=dither=bayer:bayer_scale=3",
                     str(plate)])

                d = gray_bytes(plate)
                ink = 1 - (sum(d) / len(d)) / 255
                ok = INK_MIN <= ink <= INK_MAX
                if not ok:
                    failures.append((plate.name, ink))
                flag = "" if ok else f"   <-- OUT OF RANGE ({INK_MIN}-{INK_MAX})"
                print(f"  {plate.name:<24} ink {ink * 100:5.1f}%{flag}")

        print()
        if failures:
            print(f"{len(failures)} plate(s) outside the ink range:")
            for name, ink in failures:
                print(f"  {name}  {ink * 100:.1f}%")
            sys.exit(1)
        print("all plates within ink range.")


if __name__ == "__main__":
    main()
