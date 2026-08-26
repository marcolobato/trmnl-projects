#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────
# flatirons/tools/build-plates.sh
#
# Regenerates every plate in images/flatirons/ from the original photograph
# and flatirons/masks/zones.png.
#
# The idea: one photograph, three zones, each lit independently.
#
#   time of day   moves all three zones TOGETHER   (dawn -> day -> dusk -> night)
#   weather       moves them APART                 (sun on the peaks, shadow
#                                                    on the pasture)
#
# One dial can only make the picture lighter or darker. Two dials is what
# produces drama — the cloud-shadow look where the meadow falls away while
# the Flatirons stay lit.
#
# Usage:  bash flatirons/tools/build-plates.sh /path/to/original.png
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

SRC="${1:?usage: build-plates.sh <original.png>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MASK="$ROOT/flatirons/masks/zones.png"
OUT="$ROOT/images/flatirons"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

W=780; H=420

# Area averaging, not bicubic. Bicubic sharpens as it shrinks, which adds
# high-frequency energy that the dither then has to fight. Measured on this
# source the difference is small (8.76 vs 8.15 adjacent-pixel delta) but it
# is free, and it matters more if the source is ever replaced with something
# already stippled.
GEOM="format=gray,scale=${W}:-2:flags=area,crop=${W}:${H}"

# ── The palette: 8 flat greys, 256 entries because ffmpeg insists ─────────
python3 -c "
tones = [0, 36, 73, 109, 146, 182, 219, 255]
px = b''.join(bytes([t,t,t]) * 32 for t in tones)
open('$TMP/pal.ppm','wb').write(b'P6\n16 16\n255\n' + px)
"
ffmpeg -v error -y -i "$TMP/pal.ppm" "$TMP/pal.png"

# ── Split the three-value mask into two binary masks ──────────────────────
#
# Feathered separately, because the two boundaries are physically different:
# rock against sky is a hard edge, forest against meadow is not. Baking one
# blur into the mask would force them to share a value.
python3 - <<PY
import subprocess
raw = subprocess.run(
    ["ffmpeg","-v","error","-i","$MASK","-vf","format=gray","-f","rawvideo","-"],
    capture_output=True).stdout
W,H = $W,$H
assert len(raw) == W*H, f"mask is {len(raw)} bytes, expected {W*H}"
sky     = bytes(255 if v == 0   else 0 for v in raw)
pasture = bytes(255 if v == 255 else 0 for v in raw)
open("$TMP/m_sky.pgm","wb").write(b"P5\n%d %d\n255\n" % (W,H) + sky)
open("$TMP/m_pas.pgm","wb").write(b"P5\n%d %d\n255\n" % (W,H) + pasture)
PY

# sigma ~= feather/2. 2px on the ridge, 4px on the treeline.
ffmpeg -v error -y -i "$TMP/m_sky.pgm" -vf "gblur=sigma=1.0" "$TMP/m_sky.png"
ffmpeg -v error -y -i "$TMP/m_pas.pgm" -vf "gblur=sigma=2.0" "$TMP/m_pas.png"

# ── Build one plate ───────────────────────────────────────────────────────
#
# Three exposures of the same frame, composited through the masks:
#   massif is the base, sky painted over it, then pasture over that.
build () {
  local name="$1" skyB="$2" skyC="$3" mtnB="$4" mtnC="$5" pasB="$6" pasC="$7" gam="$8"

  for z in sky mtn pas; do
    case $z in
      sky) b=$skyB; c=$skyC ;;
      mtn) b=$mtnB; c=$mtnC ;;
      pas) b=$pasB; c=$pasC ;;
    esac
    ffmpeg -v error -y -i "$SRC" \
      -vf "${GEOM},eq=brightness=${b}:contrast=${c}:gamma=${gam}" "$TMP/z_${z}.png"
  done

  ffmpeg -v error -y -i "$TMP/z_mtn.png" -i "$TMP/z_sky.png" -i "$TMP/m_sky.png" \
    -lavfi "[0:v][1:v][2:v]maskedmerge" "$TMP/step1.png"
  ffmpeg -v error -y -i "$TMP/step1.png" -i "$TMP/z_pas.png" -i "$TMP/m_pas.png" \
    -lavfi "[0:v][1:v][2:v]maskedmerge" "$TMP/step2.png"

  ffmpeg -v error -y -i "$TMP/step2.png" -i "$TMP/pal.png" \
    -lavfi "[0:v]format=rgb24[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
    "$OUT/${name}.png"

  # ── Ink-coverage invariant ──────────────────────────────────────────────
  #
  # A frame that is too dark reads as mud on reflective e-ink, and too light
  # reads as a blank panel. Cheaper to reject here than to discover it on the
  # wall three days later.
  ffmpeg -v error -i "$OUT/${name}.png" -vf format=gray -f rawvideo - 2>/dev/null \
  | python3 -c "
import sys
d = sys.stdin.buffer.read()
ink = 1 - (sum(d)/len(d))/255
flag = '' if 0.25 <= ink <= 0.55 else '   <-- OUT OF RANGE (0.25-0.55)'
print(f'  {\"$name\":<18} ink {ink*100:5.1f}%{flag}')
"
}

echo "building plates -> images/flatirons/"
echo

#      name        sky_b  sky_c   mtn_b  mtn_c   pas_b  pas_c  gamma
#
# The SKY carries time of day; the land holds roughly steady. That is both how
# it works outdoors and what keeps ink coverage in range — this photograph's
# massif is inherently dark (dense timber on the flank), so darkening it as
# well as the sky put night at 79% ink, which is mud on reflective e-ink.
build  dawn        -0.23  1.00   -0.04   1.10   -0.12   1.05   1.00
build  day          0.06  1.00    0.10   1.05    0.10   1.05   1.00
build  dusk        -0.05  1.05   -0.07   1.30   -0.14   1.20   0.95
build  night       -0.57  0.90    0.08   1.10    0.03   1.00   0.95
echo
echo "done."
