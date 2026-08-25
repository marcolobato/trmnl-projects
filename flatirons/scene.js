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

// The art is 800x432, not 800x480. TRMNL's title bar takes the bottom 48px,
// and 432 divides into 3 rows of exactly 144px — so tiles land on whole
// pixels and their edges can't shimmer.
export const ART_W = 800;
export const ART_H = 432;

export const COLS = 4;
export const ROWS = 3;
export const TILES = COLS * ROWS; // 12

export const TILE_W = ART_W / COLS; // 200
export const TILE_H = ART_H / ROWS; // 144

// The four lighting states. Named here so both the plate route and the
// scene builder agree on what's valid — and so the plate route can reject
// anything else rather than proxying arbitrary URLs.
export const PLATES = ["dawn", "day", "dusk", "night"];

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

// ── Which plate is showing ─────────────────────────────────────────────────
//
// Four lighting states. Only four, because the panel has a handful of usable
// tones — more states would spend the whole tonal range on differences
// nobody can see.

export function plateFor(clock) {
  if (clock < 5.5) return "night";
  if (clock < 8) return "dawn";
  if (clock < 17) return "day";
  if (clock < 20.5) return "dusk";
  return "night";
}

// ── The encouragement ──────────────────────────────────────────────────────
//
// Six windows rather than four, because words are cheap and specific where
// tones are not. Boulder-specific on purpose: "take a wellness break" reads
// as filler by the third day, a named trail doesn't.

export const MESSAGES = [
  { from: 5, lines: [
    "The trail's already awake.",
    "First light on the slabs.",
    "Nobody's on Chautauqua yet.",
  ]},
  { from: 7, lines: [
    "Get out there.",
    "Boots by the door.",
    "The range isn't going anywhere. You should.",
  ]},
  { from: 11, lines: [
    "Sun's high. Go stand in it.",
    "Lunch outside counts.",
    "Ten minutes on the porch.",
  ]},
  { from: 15, lines: [
    "Still time for a lap.",
    "The light's getting good.",
    "Shoes on.",
  ]},
  { from: 17, lines: [
    "Golden hour won't wait.",
    "See you outside.",
    "Last light on Bear Peak.",
  ]},
  { from: 20, lines: [
    "Rest up. The hill's still there.",
    "Tomorrow, then.",
    "Stars are out over the range.",
  ]},
];

export function messageFor(clock, dateKey) {
  // Before the first window opens, we're in last night's window — the one
  // that started at 20:00 and runs past midnight.
  let band = MESSAGES[MESSAGES.length - 1];
  if (clock >= MESSAGES[0].from) {
    for (const candidate of MESSAGES) {
      if (clock >= candidate.from) band = candidate;
    }
  }

  // Seeded by date AND by which window we're in, so the line is stable while
  // you're standing in front of it but different tomorrow.
  const seed = hashString(`${dateKey}|${band.from}`);
  return band.lines[seed % band.lines.length];
}

// ── Everything the page needs, from one instant ────────────────────────────

// `plateBase` lets the caller say where the images are served from. The
// Worker passes its own origin so markup and images share one host; the
// local server does the same. Defaults to GitHub so this function still
// works standalone.
export function buildScene(date, { plateBase = PLATE_BASE } = {}) {
  const local = localParts(date);
  const shown = revealCount(local.minutes);
  const order = revealOrder(local.dateKey);

  // Which of the 12 grid positions are uncovered right now.
  const revealed = new Set(order.slice(0, shown));

  const next = nextRevealAt(local.minutes);

  return {
    local,
    plate: plateFor(local.clock),
    plateUrl: `${plateBase}/${plateFor(local.clock)}.png`,
    message: messageFor(local.clock, local.dateKey),
    order,
    revealed,
    revealedCount: shown,
    // Handy for the debug readout in local preview.
    nextRevealMinutes: next,
  };
}
