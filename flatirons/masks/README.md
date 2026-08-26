# Zone masks

Drop exported masks in this folder. Not served by the Worker — these are
build-time inputs used to generate the plates in `images/flatirons/`.

## What to export

**One file: `zones.png`**

- **780 × 420** exactly — same as the plates
- Greyscale PNG
- **Hard edges. No feathering, no blur, no anti-aliasing.**

Three flat values, nothing in between:

| Value | Zone | What it covers |
|---|---|---|
| `#000000` black | **Sky** | everything above the ridgeline |
| `#808080` mid-grey | **Massif** | the mountain — rock, slabs, timber on the flank |
| `#FFFFFF` white | **Pasture** | everything below the treeline: snowfield, meadow, foreground conifers |

## How to trace it

1. Place `images/flatirons/day.png` in Figma at 100%, lock it
2. Draw three shapes over it, filled with the three values above
3. Hide the photo, export the frame as PNG at 1x

Anti-aliasing on the shape edges is fine — a thin ramp between two flat zones
still reads correctly. What matters is that the three zones are flat.

## Why hard edges

Feathering is done in the generator, not in Figma. Keeping it out of the mask
means the softness can be tuned per zone boundary without re-exporting —
a sharp rock/sky edge and a soft treeline want different amounts, and that is
a decision better made in code where it can be changed in seconds.

## Reference

`../../images/flatirons/day.png` is the plate to trace over. The approximate
mask currently in use is a feathered diagonal from y=225 to y=295 — good
enough to prove the effect, wrong wherever the terrain isn't straight.
