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
