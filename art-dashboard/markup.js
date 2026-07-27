// ─────────────────────────────────────────────────────────────────────────
// art-dashboard/markup.js
//
// Everything about how the plugin LOOKS lives here — the layouts, the CSS,
// the date formatting. Nothing about where it runs.
//
// Both entry points import from this file:
//
//   server.js  — Node + Express, for local previewing
//   worker.js  — Cloudflare Worker, what actually deploys
//
// That's the whole point: a layout tweak is made once, and both get it.
// Before this file existed, the same code was copied into both and they
// would have silently drifted apart the first time one was edited.
// ─────────────────────────────────────────────────────────────────────────

// Cloudflare's servers run on UTC. Without an explicit timezone the date
// rolls over to tomorrow at 6pm Denver time — correct all day in testing,
// wrong every evening in production.
export const TIME_ZONE = "America/Denver";

// ── Today's date ───────────────────────────────────────────────────────────
//
// Two separate strings so the design can style weekday and date differently.
// "en-US" gives "July 27, 2026"; swap for "en-GB" to get "27 July 2026".

export function getToday() {
  const now = new Date();

  return {
    weekday: now.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: TIME_ZONE,
    }),
    date: now.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: TIME_ZONE,
    }),
  };
}

// ── Safety ─────────────────────────────────────────────────────────────────
//
// Titles from The Met can contain characters that would break our HTML — the
// ampersand in "Arms & Armor", for instance.

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Our styles ─────────────────────────────────────────────────────────────
//
// Only OUR styles go here. TRMNL loads its framework CSS itself, so `view`,
// `layout`, and `title_bar` are already handled — we only describe the parts
// the framework has no opinion about.

export const SHARED_STYLES = `<style>
  .art {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    align-self: stretch; /* gives the image a real height to measure against */
    min-width: 0;        /* lets a wide painting shrink instead of overflowing */
    min-height: 0;
    overflow: hidden;
  }

  .art img {
    width: 100%;
    height: 100%;
    object-fit: contain; /* whole painting, never cropped */
    filter: grayscale(1) brightness(1.1) contrast(1.15);
  }

  /* The "tombstone" — museum term for the label beside a work. */
  .tombstone {
    text-align: center;
    padding: 6px 12px 0;
    min-width: 0;
  }

  .tombstone__title {
    font-style: italic; /* museum convention for titles of works */
    line-height: 1.2;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .tombstone__credit {
    padding-top: 2px;
  }

  /* ── Per-layout rules ────────────────────────────────────────────────
     One global rule can't work: the same title has very different room in
     a full screen than in a half-width column. Each layout gets its own
     type size and its own line budget before truncating. */

  .view--full .tombstone__title  { font-size: 20px; -webkit-line-clamp: 2; }
  .view--full .tombstone__credit { font-size: 14px; }

  /* Half horizontal is TWO COLUMNS, always. The painting keeps 45% of the
     width no matter how long the title runs — without this the label
     expands unopposed and the painting disappears entirely. */
  .view--half_horizontal .art {
    flex: 0 0 45%;
  }
  .view--half_horizontal .tombstone {
    flex: 1 1 auto;
    text-align: left;
    padding: 0 12px;
  }
  .view--half_horizontal .tombstone__title  { font-size: 15px; -webkit-line-clamp: 3; }
  .view--half_horizontal .tombstone__credit { font-size: 12px; }

  .view--half_vertical .tombstone__title { font-size: 16px; -webkit-line-clamp: 2; }
</style>`;

// ── One view ───────────────────────────────────────────────────────────────
//
// All four layouts share a structure and differ by CONTENT, so one builder
// with two switches covers them. `showTitle` and `showCredit` are separate so
// each layout can shed one thing at a time as space shrinks.
//
// The date lands in the title bar's `instance` slot — its right-hand
// position — which the framework provides rather than us hand-positioning it.

export function buildView(variant, art, today, { showTitle, showCredit, direction }) {
  // Identical in every layout. The date is the one thing that never gets cut.
  const titleBar = `<div class="title_bar">
    <span class="title">${escapeHtml(today.weekday)}</span>
    <span class="instance">${escapeHtml(today.date)}</span>
  </div>`;

  // No artwork? Degrade to a calendar rather than a dead screen.
  if (!art) {
    return `<div class="view view--${variant}">
  <div class="layout layout--col layout--center">
    <div class="tombstone__title">No artwork available</div>
  </div>
  ${titleBar}
</div>`;
  }

  // No "circa" prefix here — The Met already formats objectDate properly
  // ("ca. 1740-45", "mid-14th century"), so ours would double it up.
  const credit =
    showCredit && art.artist
      ? `<div class="tombstone__credit">${escapeHtml(art.artist)}${
          art.date ? " · " + escapeHtml(art.date) : ""
        }</div>`
      : "";

  const tombstone = showTitle
    ? `<div class="tombstone">
      <div class="tombstone__title">${escapeHtml(art.title)}</div>
      ${credit}
    </div>`
    : "";

  return `<div class="view view--${variant}">
  <div class="layout ${direction} layout--center">
    <div class="art">
      <img class="image image-dither" src="${escapeHtml(
        art.imageUrl
      )}" alt="${escapeHtml(art.title)}" />
    </div>
    ${tombstone}
  </div>
  ${titleBar}
</div>`;
}

// ── All four layouts, ready to send ────────────────────────────────────────
//
// This is the exact JSON shape TRMNL and the previewer expect. All four
// markup variants are required; `shared` is optional.

export function buildMarkupResponse(art, today) {
  return {
    // Full screen: painting on top, full tombstone centred beneath.
    markup: buildView("full", art, today, {
      showTitle: true,
      showCredit: true,
      direction: "layout--col",
    }),

    // Wide and short, so the tombstone sits BESIDE the painting.
    markup_half_horizontal: buildView("half_horizontal", art, today, {
      showTitle: true,
      showCredit: true,
      direction: "layout--row",
    }),

    // Narrow but still tall: room for the title, not a second line.
    markup_half_vertical: buildView("half_vertical", art, today, {
      showTitle: true,
      showCredit: false,
      direction: "layout--col",
    }),

    // Smallest of all — painting and date only.
    markup_quadrant: buildView("quadrant", art, today, {
      showTitle: false,
      showCredit: false,
      direction: "layout--col",
    }),

    shared: SHARED_STYLES,
  };
}
