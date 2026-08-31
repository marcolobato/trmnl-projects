# DECISIONS

Where the implementation diverges from `claude-code-handoff.md`, and why.
One entry per divergence. This file is the input to the retro and to plugin two.

---

## 1 · The art canvas is 800×432, not 800×480

**Brief said:** renders at 800×480.

**We did:** 800×432 for the art, with TRMNL's `title_bar` occupying the
remaining 48px.

**Why:** the brief treats 800×480 as the art area, but the reference layout
(the Met plugin) uses the framework's `title_bar`, which is a real band at the
bottom of that same 480px. Both can't have it. 432 also divides into 3 rows of
exactly 144px, so tile edges land on whole pixels instead of at 143.33 and
shimmering against the dither underneath.

---

## 2 · The plate is a photograph, not the procedural renderer

**Brief said:** port `flatirons-style-lab.jsx`; the art direction is settled.

**We did:** MVP uses `images/flatirons/*.png`, derived from Marco's own
2912×1632 photograph.

**Why:** explicitly redirected — "even if generative, I prefer my image of the
Flatirons." The procedural output was also judged not final ("those PNGs are
not perfect"). The renderer's slabs come out as an evenly-spaced sawtooth; the
real formation is irregular. **The JSX is not abandoned** — it returns once the
composition is tuned, and `scene.js` is deliberately agnostic about where the
plate comes from.

---

## 3 · Reveal pacing is decoupled from the refresh interval

**Brief said:** `tile count = floor(minutes since midnight / refresh interval)`.

**We did:** twelve tiles spread across a fixed 06:00–21:00 window; one every
75 minutes.

**Why:** the proposed formula gives 1440/15 = 96 slots for 12 tiles, so the
picture completes by 03:00 while nobody is awake. It also makes the artwork's
pacing depend on the device's refresh setting, which users can change for
battery reasons — a power setting should not re-time the composition.

The refresh interval now only controls how often the device re-samples a
function of wall-clock time.

---

## 4 · DST is avoided by construction, not handled

Denver shifts its clocks at 02:00. Because the reveal window starts at 06:00,
the tile count is pinned at 0 through the transition, so the hour that repeats
(November) or vanishes (March) lands where nothing reads it.

**This is luck, not design.** Widening the window past 02:00 will make tiles
*un-reveal* every November. If that window ever changes, the count must be
derived from a monotonic quantity instead.

---

## 5 · Reveal order is seeded from the full date, not the weekday

The prototype seeds `revealOrder` with `${terrainSeed}-${dayIndex}-${grid}`,
where `dayIndex` is day-of-week (0–6, indexed against the `DAYS` array). That
satisfies "different tomorrow" but repeats on a seven-day cycle.

We seed from `YYYY-MM-DD`.

---

## 6 · No `image-dither` class on the plate

The plate ships pre-dithered to 8 tones. TRMNL's `image-dither` class — which
`art-dashboard` relies on — would run its own error diffusion over an already
patterned image and beat one pattern against the other.

This is the one place we deliberately opt out of the framework. If we ever
switch to serving a *continuous-tone* plate, this decision reverses.

---

## 7 · Text lives in the DOM, never in the raster

**Brief said:** the prototype draws the reminder box onto the canvas with
`ctx.fillText`.

**We did:** the message is real HTML in `title_bar`.

**Why:** `markup.js` in `art-dashboard` carries a comment recording that
hardcoded pixel sizes "looked right on OG (800×480) and far too small on
TRMNL X, which has roughly 3.5× the pixels" — a bug already fixed once by
moving to TRMNL's `text--*` classes. Drawing glyphs into the raster
reintroduces it deliberately.

Canvas-drawn text was right for a browser lab. It is the wrong call for the
device.

---

## 8 · Encouragement copy replaces the reminder widget in v1

**Brief said:** one hardcoded reminder, "Running club, Thursday 6 PM",
surfacing in the newest tile from T−60 to T+30.

**We did:** a seeded encouragement line in the title bar, from six
time-of-day pools.

**Why:** directed — "encouragement reminder is the only text for now." It also
removes the only feature needing user input, stored settings and a schedule,
and stops text competing for the pixels the reveal mechanic just uncovered.

The reminder is not cancelled: once the strip exists, a reminder is a
higher-priority string that wins the slot. The hard part is already built.

---

## 9 · Only the `full` layout is implemented so far

`buildMarkupResponse` returns `markup` and `shared` only.

A landscape panorama does not reduce into a 400px column by scaling — it needs
its own crop. Portrait (400×432) and wide (800×192) crops have been cut and
reviewed but are not wired up yet.

---

## Open / unresolved

- ~~**Does the panel do grey, or only 1-bit?**~~ **RESOLVED on hardware.**
  With the plugin's presentation set to **4-bit**, the dither renders crisp on
  the device — the panel reproduces our 8 pre-dithered tones directly, with no
  second conversion. Decision #6 stands: no `image-dither`, plates stay
  pre-dithered. 1-bit and "black and white 1-bit" are both wrong for this
  plugin; a hard threshold makes the mountain vanish entirely, since every
  mid-grey collapses to white.
- **The weather zone mask is approximate** — a feathered diagonal along the
  treeline. A hand-traced three-zone mask (sky / massif / pasture) would
  decouple sky from mountain, which currently move together.
- **What happens between 21:00 and midnight**, once all twelve are revealed.
- **Timezone is hardcoded to Denver**, as in `art-dashboard`.

---

## 10 · Bleed margin stays ON, and the art is 780×420

> **Superseded in part by #14.** The width is right. The height is 410.9,
> not 420 — the framework over-allocates by one `--gap`. The plates stay at
> 780×420 regardless; #14 explains why.

**Earlier we said:** set "Remove bleed margin" to Yes, so the art could be a
full 800px wide.

**We now do:** leave it at the default No.

**Why:** every piece of breathing room in the framework comes from
`var(--gap)`. Removing the bleed margin zeroes it, which also removes the
space beneath the title bar — the text then sits directly on the physical
bottom edge of the panel.

That also fixed the arithmetic. The framework computes the art area itself:

    .layout:has(+.title_bar) {
      height: calc(var(--screen-h) - var(--gap)*2 - var(--title-bar-height));
    }

With `--gap: 10px` and `--title-bar-height: 40px` (not the 48 first assumed),
the art area is **780 × 420**. Both divide cleanly by the grid — 780/4 = 195,
420/3 = 140 — so tiles land on whole pixels.

The plates are cut to exactly 780×420 so the browser never rescales them.
Resampling an ordered dither is what turns it to mush, and `object-fit` was
quietly doing that at 800×432.

**The general lesson:** the framework already calculates this. Hardcoding a
height means maintaining a number it owns, and getting it wrong by 12px is
what pushed the title bar off-screen in the first place.

---

## 11 · The tile reveal is parked, not removed

**Brief said:** twelve tiles in a 4×3 grid, revealing one per interval, with
ghosting for unrevealed tiles. This was the plugin's headline mechanic.

**We do:** ship the full plate every refresh. `REVEAL_ENABLED = false` in
`scene.js`; the order, pacing and clock arithmetic are untouched behind it.

**Why:** over a composed naturalistic photograph the grid read as a **render
fault**, not as anticipation. Someone glancing at the panel saw a broken
image rather than a picture arriving — a fatal reading for an object meant to
sit on a wall unexplained. The Minesweeper feeling depended on the underlying
image being *graphic*; a photograph doesn't grant it.

It was also solving a problem that no longer exists. The reveal was invented
to make each day look different. Time-of-day and weather now do that, and do
it without spending the image. The mechanic was costing the photograph and
returning variation we already had.

**What stays**, because it was never really about tiles:

- the zone mask and weather compositing
- the reminder card geometry — now measured against the composition rather
  than snapped to a grid cell. `REMINDER_CARD` is a rectangle verified to sit
  100% inside the pasture zone, the brightest and least detailed area, so
  text has maximum contrast and covers nothing that matters
- `revealOrder`, `revealCount`, `nextRevealAt`, and the 06:00–21:00 pacing

**What was only ever scaffolding for tiling, and is now gone:**

| Removed | What it was for |
|---|---|
| `.scene__tiles` grid CSS | positioning 12 covers |
| `.tile` / `.tile--hidden` | the stipple treatment for unrevealed cells |
| `tiles[]` in the JSON payload | feeding the template's cover loop |
| `{% for tile in tiles %}` | drawing the covers |
| `revealed_count` in the payload | only ever displayed alongside tiles |

**One constraint quietly lifted.** The art area is 780×420 partly because
both divide cleanly by the grid — 780/4 = 195, 420/3 = 140. With no grid,
that no longer binds. The dimensions stay because they match the framework's
computed art area 1:1 and the plate must never be rescaled, but a future
change to the art size is no longer restricted to multiples of twelve.

**Worth revisiting** in a form that doesn't cut the composition into squares:
a horizontal wipe following the light, or a reveal shaped by the terrain
itself. The scheduling logic is the reusable part, which is why it is parked
rather than deleted. The old template is kept verbatim at
`flatirons/parked/template-reveal.liquid`.

---

## 12 · Dusk was rendering as midday

Reported from the device: a 6:43pm preview showed a midday-bright sky.

**Not a clock bug.** Verified: 18:43 Denver resolves correctly through
`Intl` and selects `dusk-clear`. The fault was in the tuning — dusk sky sat
at **67.5%** luminance against day's **72.6%**, five points apart, so the
plate read as noon.

Twilight is mostly a *sky* event; the land holds its warmth longer than the
sky holds its light. Dusk sky now drops to **43.1%**, with the land lifted
slightly to pay for the ink the darker sky costs.

    sky luminance:  dawn 53.3%   day 72.6%   dusk 43.1%   night 14.2%

The lesson is that per-zone luminance needed to be *measured*, not eyeballed
from a thumbnail — the numbers made an invisible five-point gap obvious.

---

## 13 · Time of day follows the sun, not the clock

Reported from the device: "golden hour won't wait" showing after dark.

The phase boundaries were fixed clock hours — dusk 17:00 to 20:30. Sunset in
Boulder swings from about **16:40 in December to 20:30 in June**, nearly four
hours, so a fixed window is roughly right for one month of the year and wrong
for the rest. In August it kept saying "golden hour" for 45 minutes after
sunset; in December it would have said it at 17:00, twenty minutes after dark.

`sunTimes()` now computes sunrise and sunset from the NOAA solar position
formula for Boulder's latitude. No API and no dependency — the sun's position
is a function of date and place, exactly the kind of thing this plugin already
computes rather than fetches. Checked against reality:

    Dec 21   computed 16:39   actual 16:38
    Jun 21   computed 20:33   actual 20:32
    Aug 25   computed 19:45   actual 19:47

Six phases, all measured against the sun:

    night        before sunrise - 45min
    firstlight   sunrise - 45min  ->  sunrise + 1h
    morning      sunrise + 1h     ->  solar noon - 1.5h
    midday       noon - 1.5h      ->  noon + 1.5h
    afternoon    noon + 1.5h      ->  sunset - 1.25h
    golden       sunset - 1.25h   ->  sunset + 30min
    night        after

Several phases share a plate — the words are finer-grained than the picture,
because words are cheap and tones are not.

**One subtlety worth keeping.** `dayOfYear` reads the LOCAL date, not the UTC
one. After 6pm in Denver it is already tomorrow in UTC, so using that would
compute the wrong day's sun every evening. The error is only a minute or two,
but it is a bug that appears exclusively after dark — the worst kind to go
hunting for months later.

---

## 14 · The white band on the left was a duplicated page wrapper

**Symptom:** a white band down the left of the photo, roughly twice the
margin on the right, and the picture sitting off-centre in its space.

**Cause:** `template.liquid` opened with its own `<div class="screen">`.
TRMNL already supplies that. Its renderer builds the page like this
(`web/views/render_html.erb` in usetrmnl/trmnlp):

    <body class="trmnl">
      <div class="screen">              <- TRMNL's
        <div class="view view--full">   <- TRMNL's
          ...our markup...

so our copy nested a second `.screen` inside the first. `.screen` carries
`padding: 10px`, so the content box started 20px in from the left instead of
10px. But `.view--full` has a *fixed* `width: var(--full-w)` — 780px — and
does not shrink to fit its now-760px parent. So the art started at x=20 and
ran to x=800, and the outer `.view--full`'s `overflow: hidden` cut the last
10px of the photo off the right-hand edge.

Measured in a headless browser against the real framework CSS:

                        plate left edge   right margin
    with the extra .screen        20px            0px   <- 10px of photo lost
    without it                    10px           10px

**Why the earlier attempts failed.** Both were aimed at `.layout`, which was
never at fault — the damage was done two levels above it, before `.layout`
was reached. `display: block` and `margin: 0` only removed the flex sizing
and the bottom gap that `.layout` legitimately needs.

**The fix:** delete the `.screen` wrapper. `.view--full` is deliberately
KEPT, even though TRMNL supplies one too. Tested four ways:

    template gives      TRMNL gives           result
    neither wrapper     screen + view         correct
    view only           screen + view         correct
    neither wrapper     screen only           picture collapses to 0px wide
    view only           screen only           correct

Keeping `.view--full` is correct in both worlds; dropping it is only correct
in one. `.layout` takes its height from `.trmnl .view--full .layout`, so with
no `.view--full` ancestor it has no height at all — which is the same
"picture disappeared" failure we already hit once by hand.

**The art area is 780 × 410.9, not 780 × 420.** The width is right; the
height is about 9px short of what DECISIONS #10 assumed. The framework
over-allocates by one `--gap`:

    .layout height   480 - 20 - 40 = 420
    .layout margin-bottom                10
    .title_bar                           40
                                        ---
                                        470   inside a .view--full of 460

Flex resolves the 10px overflow by shrinking both, so `.layout` lands at
410.875 and the title bar at 39.125.

**The plates stay at 780 × 420 anyway, and `build_plates.py` is unchanged.**
`object-fit: cover` picks its scale as max(780/780, 410.9/420) = **exactly
1.0**, so the plate is drawn pixel-for-pixel and about 4.6px is trimmed off
the top and bottom. Nothing is resampled — verified by counting tones in the
render, still the same 7 the plate ships with — so the dither is safe.

Cutting to 780×411 would recover those 9px, but 410.875 is a fractional
number that only holds on the OG at `--ui-scale: 1`; it moves on any other
device. A plate that slightly overfills and is cropped by `cover` is the more
robust of the two. **If the composition ever needs those 9px back, that is
the reason to revisit — not the white band, which is fixed.**

**One latent consequence, not acted on.** `REMINDER_CARD` is measured in
780×420 plate space, but `.scene__reminder` is positioned inside `.scene`,
which is 410.9 tall with the plate offset ~4.6px upward by the centred crop.
If the reminder card is ever switched on, it will sit ~4.6px low against the
picture. Harmless today — the card is not rendered.
