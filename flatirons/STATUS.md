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

## THE OPEN PROBLEM

There is blank white space on the left of the picture, and the picture does
not sit evenly in its space. Some things already ruled out:

- Not the "Remove bleed margin" setting — it changes all four sides equally
- Not the framework overflowing — its own maths is correct (780x420)
- Not the photo being brighter on the left — confirmed the white has no dots
  in it, so it is empty space, not snowfield

Two things were tried and both made it worse, so **do not repeat them**:

- `display: block` on `.layout` — pushed the picture down out of sight
- `margin: 0` on `.layout` — removed the gap between picture and bar

The current CSS is back to the version that displayed correctly.

Still unknown: whether the space TRMNL gives the picture is really 780x420.
If it is not, the twelve pictures need recutting to the real size.
`build_plates.py` does that — change `W, H` at the top and re-run.

## Things still on the list

- Portrait and wide layouts (crops exist, not wired up)
- Letting people change the "Get outside" wording, via TRMNL's Form Fields
- Real weather instead of the seeded guess — one function to swap
- The `?t=` debug option reads local time on your machine but UTC on the server
