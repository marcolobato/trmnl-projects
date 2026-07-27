// ─────────────────────────────────────────────────────────────────────────
// art-dashboard/worker.js
//
// The Cloudflare Worker version of the art dashboard.
//
// Same job as server.js — ask The Met for a painting, return TRMNL markup —
// but written for a different runtime. Three things had to change:
//
//   1. No Express. Workers hand you a `fetch` function and expect a Response.
//   2. No startup step. A Worker spins up per request and vanishes, so the
//      artwork ID list can't be loaded once at boot.
//   3. No local clock. Workers run on UTC, so the date needs an explicit
//      timezone or the frame shows tomorrow from 6pm Denver time onward.
//
// server.js still exists and still works — keep using it for local previewing.
// ─────────────────────────────────────────────────────────────────────────

// Cloudflare's servers run on UTC. Without this, `toLocaleDateString` would
// format against UTC and roll over to tomorrow six hours early.
const TIME_ZONE = "America/Denver";

const SEARCH_URL =
  "https://collectionapi.metmuseum.org/public/collection/v1/search" +
  "?q=landscape&hasImages=true";

const OBJECT_URL =
  "https://collectionapi.metmuseum.org/public/collection/v1/objects/";

// ── Getting the candidate list ─────────────────────────────────────────────
//
// server.js loads this once when the server starts. A Worker has no "start",
// so we fetch it on demand.
//
// This variable lives at module level, which means it MAY survive between
// requests that happen to reuse the same instance — a free speed-up when it
// works, harmless when it doesn't. It is a best-effort cache, never a
// guarantee, so the code must work correctly either way.

let cachedIDs = null;

async function getObjectIDs() {
  if (cachedIDs) return cachedIDs;

  const response = await fetch(SEARCH_URL);
  const data = await response.json();
  cachedIDs = data.objectIDs || [];
  return cachedIDs;
}

// ── Picking one public-domain artwork ──────────────────────────────────────
// Identical logic to server.js: try a few at random until one is both public
// domain and actually has an image.

async function getRandomArtwork() {
  const MAX_TRIES = 8;
  const objectIDs = await getObjectIDs();

  if (objectIDs.length === 0) return null;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const id = objectIDs[Math.floor(Math.random() * objectIDs.length)];

    const response = await fetch(OBJECT_URL + id);
    if (!response.ok) continue;

    const art = await response.json();

    if (art.isPublicDomain && art.primaryImage) {
      return {
        imageUrl: art.primaryImage,
        title: art.title || "Untitled",
        artist: art.artistDisplayName || "Unknown artist",
        date: art.objectDate || "",
      };
    }
  }

  return null;
}

// ── Today's date, in YOUR timezone ─────────────────────────────────────────

function getToday() {
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

// ── Markup ─────────────────────────────────────────────────────────────────
// Everything below mirrors server.js exactly. See the note at the bottom of
// this file about keeping the two in step.

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHARED_STYLES = `<style>
  .art {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .art img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: grayscale(1) brightness(1.1) contrast(1.15);
  }

  .tombstone {
    text-align: center;
    padding: 6px 12px 0;
    min-width: 0;
  }

  .tombstone__title {
    font-style: italic;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .tombstone__credit {
    padding-top: 2px;
  }

  .view--full .tombstone__title  { font-size: 20px; -webkit-line-clamp: 2; }
  .view--full .tombstone__credit { font-size: 14px; }

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

function buildView(variant, art, today, { showTitle, showCredit, direction }) {
  const titleBar = `<div class="title_bar">
    <span class="title">${escapeHtml(today.weekday)}</span>
    <span class="instance">${escapeHtml(today.date)}</span>
  </div>`;

  if (!art) {
    return `<div class="view view--${variant}">
  <div class="layout layout--col layout--center">
    <div class="tombstone__title">No artwork available</div>
  </div>
  ${titleBar}
</div>`;
  }

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

function buildMarkupResponse(art, today) {
  return {
    markup: buildView("full", art, today, {
      showTitle: true,
      showCredit: true,
      direction: "layout--col",
    }),
    markup_half_horizontal: buildView("half_horizontal", art, today, {
      showTitle: true,
      showCredit: true,
      direction: "layout--row",
    }),
    markup_half_vertical: buildView("half_vertical", art, today, {
      showTitle: true,
      showCredit: false,
      direction: "layout--col",
    }),
    markup_quadrant: buildView("quadrant", art, today, {
      showTitle: false,
      showCredit: false,
      direction: "layout--col",
    }),
    shared: SHARED_STYLES,
  };
}

// ── The Worker entry point ─────────────────────────────────────────────────
//
// Express gave us app.get() and app.post(). A Worker gives us ONE function
// for every request, so we read the path and method ourselves.

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // The route TRMNL and the previewer call.
    if (url.pathname === "/trmnl/markup" && request.method === "POST") {
      const art = await getRandomArtwork();
      const today = getToday();
      return Response.json(buildMarkupResponse(art, today));
    }

    // A plain GET so you can open the URL in a browser and confirm it's alive.
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        "Art dashboard worker is running. POST to /trmnl/markup for TRMNL markup.",
        { headers: { "content-type": "text/plain" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};

// ── Note on duplication ────────────────────────────────────────────────────
//
// escapeHtml, SHARED_STYLES, and buildView are copied verbatim from
// server.js. That is a deliberate, temporary choice: porting the runtime and
// refactoring the shared code at the same time would make a failure hard to
// diagnose.
//
// The cost is real — a layout tweak now has to be made in BOTH files, and
// they will drift apart the first time you forget. Once this is deployed and
// proven, the fix is to move the shared pieces into their own module that
// server.js and worker.js both import.
