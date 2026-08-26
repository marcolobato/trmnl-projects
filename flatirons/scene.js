// ─────────────────────────────────────────────────────────────────────────
// flatirons/scene.js
//
// Everything this plugin DECIDES lives here. Nothing it decides depends on
// the network, on a database, or on what happened during the last refresh.
//
// The whole plugin is one idea: the screen is a pure function of a moment
// in time.
//
//     buildScene(new Date())  ->  { plate, message, revealed, ... }
//
// Same instant in, same screen out. That's why there's no database — and
// why a device that sleeps all night wakes up showing the correct picture
// instead of being twelve reveals behind.
//
// Notice that the time is PASSED IN rather than read here with Date.now().
// That one choice is what lets server.js accept a `?t=` override so you can
// look at 3am in the middle of the afternoon, instead of waiting for 3am.
// ─────────────────────────────────────────────────────────────────────────

// ── Fixed facts about the plugin ───────────────────────────────────────────

// Cloudflare's servers run on UTC. Without this, the date rolls over to
// tomorrow at 6pm Denver time — correct all day in testing, wrong every
// evening in production. Same lesson art-dashboard already learned.
export const TIME_ZONE = "America/Denver";

// The art area is 780x420, not the full 800x480. The framework computes it:
//
//   width  = screen-w - (gap * 2)              = 800 - 20 = 780
//   height = screen-h - (gap * 2) - title-bar  = 480 - 20 - 40 = 420
//
// with --gap 10px and --title-bar-height 40px.
//
// These also divide cleanly by the old tile grid (780/4 = 195, 420/3 = 140),
// but with the reveal parked that no longer constrains anything — see
// DECISIONS.md #11 before assuming a future art size must be a multiple of 12.
//
// The plates are cut to exactly this size so the browser never rescales them
// — resampling an ordered dither is what turns it to mush.
export const ART_W = 780;
export const ART_H = 420;

// ── The tile reveal, parked ────────────────────────────────────────────────
//
// PARKED, NOT DELETED. Set this true and the grid comes back exactly as it
// was — the order, the pacing and the clock arithmetic below are all intact
// and still unit-testable.
//
// Why it came out: over a composed naturalistic photograph the grid read as a
// RENDER FAULT rather than as anticipation. Someone glancing at the panel saw
// a broken image, not a picture arriving. That reading is fatal for an object
// meant to sit on a wall unexplained.
//
// It was also solving a problem that no longer exists. The reveal was invented
// to make each day look different; time-of-day and weather now do that, and do
// it without spending the image. The mechanic was costing us the photograph
// and returning variation we already had.
//
// Worth revisiting in a form that doesn't cut the composition into squares —
// a horizontal wipe following the light, or a reveal shaped by the terrain
// rather than by a grid. The scheduling logic is the reusable part.
export const REVEAL_ENABLED = false;

export const COLS = 4;
export const ROWS = 3;
export const TILES = COLS * ROWS; // 12

export const TILE_W = ART_W / COLS; // 195
export const TILE_H = ART_H / ROWS; // 140

// ── Where a reminder card sits ─────────────────────────────────────────────
//
// Kept from the reveal work, but no longer a grid cell. Measured against the
// zone mask rather than chosen by eye: this rectangle is 100% inside the
// pasture zone, which is the brightest and least detailed part of the frame,
// so text on it has maximum contrast and covers nothing that matters.
//
// The peak sits right of centre and the treeline descends left to right, so
// the lower LEFT is the only large area that stays clear at every hour.
export const REMINDER_CARD = { x: 40, y: 290, w: 340, h: 100 };

// Four lighting states × three weather states = twelve plates, named
// "<time>-<weather>.png". Listed here so the plate route and the scene
// builder agree on what's valid, and so the route can reject anything else
// rather than proxying arbitrary URLs.
export const TIMES = ["dawn", "day", "dusk", "night"];
export const WEATHERS = ["clear", "sunbreak", "stormlight"];
export const PLATES = TIMES.flatMap((t) => WEATHERS.map((w) => `${t}-${w}`));

// Fallback location for the plates. Both runtimes normally override this
// with their OWN origin, so the images are served from the same host as the
// markup — see the note in worker.js. This GitHub URL is only used if
// nobody passes a base, which keeps scene.js usable on its own in tests.
export const PLATE_BASE =
  "https://raw.githubusercontent.com/marcolobato/trmnl-projects/main/images/flatirons";

// ── The reveal window ──────────────────────────────────────────────────────
//
// Twelve tiles spread across a waking day, NOT one per refresh.
//
// Tying reveals to the refresh interval was tempting and wrong: 1440 minutes
// divided by a 15-minute refresh is 96 slots for 12 tiles, so the whole
// picture would finish by 3am while you were asleep. It also would have made
// the artwork's pacing depend on a battery setting the user can change.

const START_MIN = 6 * 60; // 06:00
const END_MIN = 21 * 60; // 21:00
const SLOT = (END_MIN - START_MIN) / TILES; // 75 minutes per tile

// Worth knowing: this window also sidesteps daylight saving. Denver shifts
// its clocks at 2am, and at 2am the tile count is pinned at 0, so the hour
// that repeats (or vanishes) lands where nothing depends on it. If anyone
// ever widens this window past 2am, tiles will start un-revealing in
// November. See DECISIONS.md.

// ── Reading the clock in Denver ────────────────────────────────────────────
//
// A Date object is just an instant; it has no timezone of its own. Intl is
// how we ask "what time was it in Denver at that instant", and it works
// identically in Node and in a Cloudflare Worker.

export function localParts(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23", // 00-23. Without this midnight can come back as "24".
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
  });

  const parts = {};
  for (const part of fmt.formatToParts(date)) parts[part.type] = part.value;

  const hour = Number(parts.hour);
  const minute = Number(parts.minute);

  // "Tuesday, August 25, 2026" — the long American form for the title bar.
  // Built with a second formatter rather than assembled from the parts above,
  // so the comma placement and month names come from Intl rather than from us
  // hand-gluing strings together.
  const longDate = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);

  return {
    // "2026-08-25" — the seed for everything that should change daily.
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    longDate,
    hour,
    minute,
    minutes: hour * 60 + minute,
    // Fractional hour, e.g. 18.5 — easier to compare against the phase table.
    clock: hour + minute / 60,
  };
}

// ── Seeded randomness ──────────────────────────────────────────────────────
//
// Math.random() can't be seeded, so we need our own. These two together turn
// a date string into a shuffle that is random-looking but identical for
// everyone, on every device, all day.

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates. Seeded from the full date, NOT the weekday — seeding from
// the weekday would make the order repeat every seven days.
export function revealOrder(dateKey) {
  const rand = mulberry32(hashString(dateKey));
  const order = Array.from({ length: TILES }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// ── How much of the picture is uncovered ───────────────────────────────────

export function revealCount(minutes) {
  if (minutes < START_MIN) return 0;
  const n = Math.floor((minutes - START_MIN) / SLOT) + 1;
  return Math.max(0, Math.min(TILES, n));
}

// When the next tile lands, as minutes-since-midnight. null once complete.
export function nextRevealAt(minutes) {
  const shown = revealCount(minutes);
  if (shown >= TILES) return null;
  return START_MIN + shown * SLOT;
}

// ── Where the sun actually is ──────────────────────────────────────────────
//
// Fixed clock hours were wrong, and wrong in a way that only shows up months
// later. Sunset in Boulder swings from about 16:40 in December to 20:30 in
// June — nearly four hours. A hardcoded "dusk starts at 17:00" is roughly
// right in June and completely wrong in December, where 17:00 is already
// dark and "golden hour won't wait" is nonsense.
//
// This is the NOAA solar position calculation, trimmed to sunrise and sunset.
// No API and no dependency: the sun's position is a function of date and
// latitude, which is exactly the kind of thing this plugin already computes
// rather than fetches. Checked against reality — Dec 21 sunset comes out at
// 16:39 against an actual 16:38, Jun 21 at 20:33 against 20:32.

const LATITUDE = 40.015;    // Boulder, Colorado
const LONGITUDE = -105.2705;
const RAD = Math.PI / 180;

// Day of year from the LOCAL date, not the UTC one. After 6pm in Denver it is
// already tomorrow in UTC, and using that would compute the wrong day's sun
// every evening. Only a minute or two of error — sunset moves that much per
// day — but it would be a bug that only ever appears after dark, which is the
// worst kind to go looking for later.
function dayOfYear(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

// Sunrise and sunset as fractional hours in Denver local time, e.g. 19.75.
export function sunTimes(date) {
  const local = localParts(date);
  const n = dayOfYear(local.dateKey);
  const [ly, lm, ld] = local.dateKey.split("-").map(Number);
  const g = ((2 * Math.PI) / 365) * (n - 1 + 0.5); // fractional year

  // Equation of time: the sun runs up to ~16 minutes fast or slow against
  // the clock, because Earth's orbit is elliptical and tilted.
  const eq =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
      - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));

  const dec =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);

  // 90.833° rather than 90° accounts for atmospheric refraction and the
  // sun's disc having width — sunset is when the last edge disappears.
  const cosHa =
    Math.cos(90.833 * RAD) / (Math.cos(LATITUDE * RAD) * Math.cos(dec))
    - Math.tan(LATITUDE * RAD) * Math.tan(dec);

  // Above the Arctic circle this has no solution. Boulder never hits it, but
  // returning something sane beats returning NaN if the location ever moves.
  if (cosHa > 1) return { sunrise: 12, sunset: 12 };   // sun never rises
  if (cosHa < -1) return { sunrise: 0, sunset: 24 };   // never sets

  const ha = Math.acos(cosHa) / RAD;
  const toLocal = (utcMinutes) => {
    const at = new Date(Date.UTC(ly, lm - 1, ld, 0, Math.round(utcMinutes)));
    return localParts(at).clock;
  };

  return {
    sunrise: toLocal(720 - 4 * (LONGITUDE + ha) - eq),
    sunset: toLocal(720 - 4 * (LONGITUDE - ha) - eq),
  };
}

// ── Which phase of the day it is ───────────────────────────────────────────
//
// Six phases, all measured against the sun rather than the clock. "Golden
// hour" now means the actual golden hour: the 75 minutes before sunset and
// the half hour after, wherever those land in the calendar.

export function sunPhase(clock, sun) {
  const noon = (sun.sunrise + sun.sunset) / 2;
  if (clock < sun.sunrise - 0.75) return "night";
  if (clock < sun.sunrise + 1.0) return "firstlight";
  if (clock < noon - 1.5) return "morning";
  if (clock < noon + 1.5) return "midday";
  if (clock < sun.sunset - 1.25) return "afternoon";
  if (clock < sun.sunset + 0.5) return "golden";
  return "night";
}

// ── Which plate is showing ─────────────────────────────────────────────────
//
// Four lighting states. Only four, because the panel has a handful of usable
// tones — more states would spend the whole tonal range on differences
// nobody can see. Several phases share a plate; the words are finer-grained
// than the picture because words are cheap and tones are not.

const PHASE_PLATE = {
  night: "night",
  firstlight: "dawn",
  morning: "day",
  midday: "day",
  afternoon: "day",
  golden: "dusk",
};

export function timeFor(clock, sun) {
  return PHASE_PLATE[sunPhase(clock, sun)];
}

// ── Which weather is showing ───────────────────────────────────────────────
//
// Two moods a day: one before 13:00, one after. A single mood all day makes
// every afternoon a rerun of its own morning; four would change often enough
// that no look ever settles.
//
// Seeded rather than fetched. There is no weather API in v1, and there
// doesn't need to be — what the picture needs is for each day to have its own
// character, not to be accurate. A real forecast can replace this function
// later without anything else changing.
//
// Clear is weighted to roughly half the slots. Storm light is striking, and
// striking every day is just the new normal.
const WEATHER_WEIGHTS = ["clear", "clear", "clear", "sunbreak", "sunbreak", "stormlight"];

export function weatherFor(clock, dateKey) {
  const half = clock < 13 ? "am" : "pm";
  const roll = hashString(`${dateKey}|weather|${half}`) % WEATHER_WEIGHTS.length;
  return WEATHER_WEIGHTS[roll];
}

// The plate filename is just the two together.
export function plateFor(clock, dateKey, sun) {
  return `${timeFor(clock, sun)}-${weatherFor(clock, dateKey)}`;
}

// ── The encouragement ──────────────────────────────────────────────────────
//
// Six windows rather than four, because words are cheap and specific where
// tones are not. Boulder-specific on purpose: "take a wellness break" reads
// as filler by the third day, a named trail doesn't.

// Each window has a PREFIX and a set of endings. The message is the two
// joined with a comma, so every line states the ask plainly before the
// flavour — "Get outside, golden hour won't wait" rather than trusting the
// reader to infer it from a mountain photograph.
//
// The prefix is a separate field rather than baked into each line so it can
// become a user setting later: one TRMNL form field replacing "Get outside"
// with whatever someone is actually chasing that season.
//
// Night keeps a different prefix on purpose. Telling someone to go outside
// at 11pm is bad advice, and the plugin loses its credibility the first time
// it says something the reader knows is wrong.

// Keyed by sun phase rather than clock hour. "Golden hour won't wait" now
// only appears during the actual golden hour — the 75 minutes before sunset —
// wherever that falls in the calendar, instead of at a fixed 17:00 that is
// already dark for half the year.
export const MESSAGES = {
  firstlight: { prefix: "Get outside", lines: [
    "the trail's already awake.",
    "first light's on the slabs.",
    "nobody's on Chautauqua yet.",
  ]},
  morning: { prefix: "Get outside", lines: [
    "boots by the door.",
    "the range isn't going anywhere.",
    "it's better out there.",
  ]},
  midday: { prefix: "Get outside", lines: [
    "the sun's high — go stand in it.",
    "lunch outside counts.",
    "ten minutes on the porch will do.",
  ]},
  afternoon: { prefix: "Get outside", lines: [
    "there's still time for a lap.",
    "the light's getting good.",
    "shoes on.",
  ]},
  golden: { prefix: "Get outside", lines: [
    "golden hour won't wait.",
    "last light's on Bear Peak.",
    "catch the alpenglow.",
  ]},
  // Night keeps a different prefix. Telling someone to go outside at 11pm is
  // advice they know is wrong, and a plugin that says one wrong thing loses
  // credibility for everything else it says.
  night: { prefix: "Rest up", lines: [
    "the hill's still there tomorrow.",
    "the stars are out over the range.",
    "you'll want the early light.",
  ]},
};

export function messageFor(clock, dateKey, sun) {
  const phase = sunPhase(clock, sun);
  const band = MESSAGES[phase];

  // Seeded by date AND phase, so the line is stable while you're standing in
  // front of it but different tomorrow.
  const seed = hashString(`${dateKey}|${phase}`);
  return `${band.prefix}, ${band.lines[seed % band.lines.length]}`;
}

// ── Everything the page needs, from one instant ────────────────────────────

// `plateBase` lets the caller say where the images are served from. The
// Worker passes its own origin so markup and images share one host; the
// local server does the same. Defaults to GitHub so this function still
// works standalone.
export function buildScene(date, { plateBase = PLATE_BASE } = {}) {
  const local = localParts(date);
  const sun = sunTimes(date);

  // With the reveal parked, every tile is "revealed" — which is just another
  // way of saying the whole plate ships. The scheduling call is still made so
  // the numbers stay observable in /health and in the local preview, and so
  // turning REVEAL_ENABLED back on is a one-line change rather than an
  // archaeology exercise.
  const shown = REVEAL_ENABLED ? revealCount(local.minutes) : TILES;
  const order = revealOrder(local.dateKey);
  const revealed = new Set(order.slice(0, shown));

  const next = REVEAL_ENABLED ? nextRevealAt(local.minutes) : null;

  return {
    local,
    plate: plateFor(local.clock, local.dateKey, sun),
    time: timeFor(local.clock, sun),
    phase: sunPhase(local.clock, sun),
    sun,
    weather: weatherFor(local.clock, local.dateKey),
    plateUrl: `${plateBase}/${plateFor(local.clock, local.dateKey, sun)}.png`,
    message: messageFor(local.clock, local.dateKey, sun),
    order,
    revealed,
    revealedCount: shown,
    // Handy for the debug readout in local preview.
    nextRevealMinutes: next,
  };
}
