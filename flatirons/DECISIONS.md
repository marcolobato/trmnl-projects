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

- **Does the panel do grey, or only 1-bit?** The Met render shows pure black
  dots on white, suggesting 1-bit. If so, our 8 flat tones still need a final
  conversion somewhere, and #6 needs revisiting. **Untested on hardware.**
- **The weather zone mask is approximate** — a feathered diagonal along the
  treeline. A hand-traced three-zone mask (sky / massif / pasture) would
  decouple sky from mountain, which currently move together.
- **What happens between 21:00 and midnight**, once all twelve are revealed.
- **Timezone is hardcoded to Denver**, as in `art-dashboard`.
