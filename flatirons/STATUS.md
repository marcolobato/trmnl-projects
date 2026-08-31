# Where this plugin is right now

Read this first, then `DECISIONS.md` for why things are the way they are.

## What it is

A TRMNL plugin showing a photo of the Boulder Flatirons that changes with the
time of day and the weather, with a line of text nudging you to go outside.

- **Live at** https://flatirons.marcolobato-ux.workers.dev
- Deploy with `npx wrangler deploy -c wrangler.flatirons.toml`
  (the `-c` matters — without it you overwrite the other plugin)

## Files

    flatirons/scene.js          decides everything from the current time
    flatirons/markup.js         builds the HTML
    flatirons/server.js         local preview, `npm run flatirons`
    flatirons/worker.js         what runs live
    flatirons/template.liquid   paste this into TRMNL's markup editor
    flatirons/tools/build_plates.py   regenerates the twelve pictures
    flatirons/masks/zones.png   marks sky / mountain / pasture
    images/flatirons/*.png      twelve pictures, 780x420

## How it works

Nothing is stored. The whole screen is worked out from the current time:

- **Sunrise and sunset** are calculated for Boulder, so "golden hour" means the
  real golden hour whatever the season
- **Four lighting states** — dawn, day, dusk, night
- **Three weather moods** — clear, sunbreak, stormlight — picked from the date,
  twice a day. No weather service; it just needs each day to feel different
- **The message** comes from a pool per phase, also picked from the date

## Settings on the TRMNL plugin page

    Strategy               Polling
    Polling URL            https://flatirons.marcolobato-ux.workers.dev
    Polling Verb           GET
    Remove bleed margin    No
    Dark Mode              No
    Framework CSS          v3.2.0
    Presentation           4-bit      <- important, 1-bit looks broken

## Solved — the white band on the left of the photo

The white band on the left was a **duplicated page wrapper**, not a sizing
problem. `template.liquid` opened with its own `<div class="screen">`, and
TRMNL already supplies one. Two nested `.screen`s meant two lots of 10px
padding, so the art started 20px in from the left — but `.view--full` has a
fixed 780px width and doesn't shrink, so it ran off the right-hand edge and
the last 10px of the photo was clipped away.

    with the extra .screen    left 20px   right 0px   (10px of photo lost)
    without it                left 10px   right 10px

The fix is in `template.liquid`: the `.screen` wrapper is gone. `.view--full`
is deliberately kept — see DECISIONS.md #14 for why removing both is the
riskier choice.

Both earlier attempts failed because they targeted `.layout`, which was never
at fault. The damage was done two levels above it.

**And the answer to "is the space really 780×420": the width is, the height
isn't — it is 410.9.** The framework over-allocates by one `--gap`, so flex
shrinks `.layout` from 420 to 410.875. **The plates stay at 780×420 and
`build_plates.py` is unchanged**: `object-fit: cover` resolves to a scale of
exactly 1.0, so the plate is drawn pixel-for-pixel with ~4.6px trimmed top and
bottom and nothing is resampled. Recutting would only buy back those 9px, at
the cost of baking in a fractional number that only holds on the OG panel.

### Checking a layout change without a device

The bug was found by rendering the real markup inside TRMNL's real wrapper
and measuring, rather than by eye:

1. Get the framework CSS. The pinned URL has **no `v`** in it:

       curl -sL https://usetrmnl.com/css/3.2.0/plugins.css   # works
       curl -sL https://usetrmnl.com/css/v3.2.0/plugins.css  # 404

2. Wrap the template in what TRMNL's own renderer emits — see DECISIONS.md
   #14, or `web/views/render_html.erb` in the usetrmnl/trmnlp repo.
3. Render at 800x480 in headless Chrome and read back
   `getBoundingClientRect()` for `.layout`, `.scene` and the plate.

That turns "it looks off" into numbers, which is what made the 20px/0px
asymmetry obvious. Checked against both `3.2.0` (what the plugin pins) and
`latest`; they measure identically.

## Things still on the list

- Portrait and wide layouts (crops exist, not wired up)
- Letting people change the "Get outside" wording, via TRMNL's Form Fields
- Real weather instead of the seeded guess — one function to swap
- The `?t=` debug option reads local time on your machine but UTC on the server
