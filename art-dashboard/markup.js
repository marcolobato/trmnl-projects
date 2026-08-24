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
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .tombstone__credit {
    padding-top: 2px;

    /* Clamped like the title. An attribution such as "Workshop of Andrea del
       Verrocchio · ca. 1470-1475" would otherwise wrap unchecked and shove
       the painting around — the same failure the title clamp prevents. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
  }

  /* The "no artwork" message. NOT italic — italics are our convention for
     titles of works, and this is a plain status message. The calendar in the
     bar below is doing the real job in this state. */
  .no-art {
    text-align: center;
    padding: 0 12px;
  }

  /* ── Per-layout rules ────────────────────────────────────────────────
     Note what is NOT here any more: font sizes.

     Those now come from TRMNL's text--* utility classes applied in the
     markup, because those classes adapt to each device's density. Our old
     hardcoded pixels looked right on OG (800x480) and far too small on
     TRMNL X (1404x1872), which has roughly 3.5x the pixels.

     What stays here is the line budget and the column geometry — things
     the utility classes have no opinion about. */

  .view--full .tombstone__title { -webkit-line-clamp: 2; }

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
  .view--half_horizontal .tombstone__title  { -webkit-line-clamp: 3; }
  /* Narrow column, so the credit gets a second line before truncating. */
  .view--half_horizontal .tombstone__credit { -webkit-line-clamp: 2; }

  .view--half_vertical .tombstone__title { -webkit-line-clamp: 2; }
</style>`;

// ── One view ───────────────────────────────────────────────────────────────
//
// All four layouts share a structure and differ by CONTENT, so one builder
// with two switches covers them. `showTitle` and `showCredit` are separate so
// each layout can shed one thing at a time as space shrinks.
//
// The date lands in the title bar's `instance` slot — its right-hand
// position — which the framework provides rather than us hand-positioning it.

export function buildView(
  variant,
  art,
  today,
  { showTitle, showCredit, direction, titleClass, creditClass }
) {
  // Identical in every layout. The date is the one thing that never gets cut.
  const titleBar = `<div class="title_bar">
    <span class="title">${escapeHtml(today.weekday)}</span>
    <span class="instance">${escapeHtml(today.date)}</span>
  </div>`;

  // No artwork? Degrade to a calendar rather than a dead screen.
  if (!art) {
    return `<div class="view view--${variant}">
  <div class="layout layout--col layout--center">
    <div class="no-art text--base lg:text--large">No artwork available</div>
  </div>
  ${titleBar}
</div>`;
  }

  // No "circa" prefix here — The Met already formats objectDate properly
  // ("ca. 1740-45", "mid-14th century"), so ours would double it up.
  const credit =
    showCredit && art.artist
      ? `<div class="tombstone__credit ${creditClass}">${escapeHtml(art.artist)}${
          art.date ? " · " + escapeHtml(art.date) : ""
        }</div>`
      : "";

  const tombstone = showTitle
    ? `<div class="tombstone">
      <div class="tombstone__title ${titleClass}">${escapeHtml(art.title)}</div>
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

// Type sizes come from TRMNL's utility classes rather than our own pixels.
//
// The `lg:` prefix is the key part: it raises the size on larger displays,
// so the same markup reads correctly on both an 800x480 OG and a 1404x1872
// TRMNL X. Without it, text sized for OG looks tiny on X.
export function buildMarkupResponse(art, today) {
  return {
    // Full screen: painting on top, full tombstone centred beneath.
    markup: buildView("full", art, today, {
      showTitle: true,
      showCredit: true,
      direction: "layout--col",
      titleClass: "text--large lg:text--xlarge",
      creditClass: "text--base lg:text--large",
    }),

    // Wide and short, so the tombstone sits BESIDE the painting.
    // One step down the scale, since it shares the width with the painting.
    markup_half_horizontal: buildView("half_horizontal", art, today, {
      showTitle: true,
      showCredit: true,
      direction: "layout--row",
      titleClass: "text--base lg:text--large",
      creditClass: "text--small lg:text--base",
    }),

    // Narrow but still tall: room for the title, not a second line.
    markup_half_vertical: buildView("half_vertical", art, today, {
      showTitle: true,
      showCredit: false,
      direction: "layout--col",
      titleClass: "text--base lg:text--large",
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
