// ─────────────────────────────────────────────────────────────────────────
// art-dashboard/server.js
//
// A tiny web server that does three things:
//   1. Asks The Met's public API for a random public-domain painting.
//   2. Wraps that painting in an HTML page styled for a black & white e-ink screen.
//   3. Serves that page at http://localhost:3000 so the TRMNL previewer can see it.
//
// It uses Express (a small, friendly web-server library) and Node's built-in
// `fetch` (for calling the Met API). Nothing else.
// ─────────────────────────────────────────────────────────────────────────

import express from "express";

const app = express();
const PORT = 3000;

// The Met's screen is TRMNL "OG" size: 800 x 480 pixels, 1-bit (pure black/white).
// We build our HTML to those exact dimensions so what we see matches the device.
const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 480;

// ── Step 1: get a list of candidate artworks from The Met ──────────────────
//
// The Met's search endpoint returns a big list of object IDs. We ask only for
// items that HAVE an image (`hasImages=true`) and match a gentle theme word.
// We fetch this list ONCE when the server starts and keep it in memory, so we
// don't hammer the API on every page load.
//
// Note: the search endpoint can't filter "public domain" for us, so after we
// pick an ID we double-check each artwork's `isPublicDomain` flag below.

let objectIDs = []; // will hold the candidate list

async function loadObjectIDs() {
  const url =
    "https://collectionapi.metmuseum.org/public/collection/v1/search" +
    "?q=landscape&hasImages=true";
  const response = await fetch(url);
  const data = await response.json();
  // `data.objectIDs` is an array of numbers. If the search fails it can be null,
  // so we fall back to an empty array to avoid crashes.
  objectIDs = data.objectIDs || [];
  console.log(`Loaded ${objectIDs.length} candidate artworks from The Met.`);
}

// ── Step 2: pick ONE public-domain painting that has a real image ──────────
//
// We pick a random ID, fetch its details, and check two things:
//   - is it public domain? (free to display)
//   - does it actually have a `primaryImage` URL?
// If not, we try again — up to a few times — then give up gracefully.

async function getRandomArtwork() {
  const MAX_TRIES = 8;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // Pick a random position in the list.
    const randomIndex = Math.floor(Math.random() * objectIDs.length);
    const id = objectIDs[randomIndex];

    const response = await fetch(
      `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`
    );
    const art = await response.json();

    if (art.isPublicDomain && art.primaryImage) {
      // Found a good one. Return just the fields we care about.
      return {
        imageUrl: art.primaryImage,
        title: art.title || "Untitled",
        artist: art.artistDisplayName || "Unknown artist",
        date: art.objectDate || "",
      };
    }
    // Otherwise the loop tries another random artwork.
  }

  // If we somehow struck out every time, return null so the page can say so.
  return null;
}

// ── Step 2b: today's date, for the calendar corner ─────────────────────────
//
// `new Date()` gives us the moment this function runs. `toLocaleDateString`
// turns that raw timestamp into words a human reads.
//
// We return TWO separate strings rather than one, so the design can style the
// weekday and the date differently (bigger, bolder, stacked).
//
// "en-US" gives month-before-day — "July 27, 2026". Swap it for "en-GB" if you
// ever prefer "27 July 2026"; nothing else has to change.

function getToday() {
  const now = new Date();

  return {
    weekday: now.toLocaleDateString("en-US", { weekday: "long" }),
    date: now.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}

// ── Step 3: build the HTML page for the e-ink screen ───────────────────────
//
// This is a plain HTML string with the artwork dropped in. The CSS is where the
// "make it look good in black & white" work happens:
//   - grayscale + high contrast filters push the photo toward crisp B&W.
//   - The TRMNL preview pipeline does the final 1-bit conversion for us, so we
//     don't have to write any dithering math ourselves.

function buildPage(art) {
  // Work out today's date once, up front, so the template below can use it.
  const today = getToday();

  // If we couldn't find art, show a calm message instead of a broken image.
  if (!art) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }

      /* Same 800x480 canvas as the real screen, so both look like one product. */
      .screen {
        width: ${SCREEN_WIDTH}px;
        height: ${SCREEN_HEIGHT}px;
        background: #ffffff;
        display: flex;
        flex-direction: column;
        font-family: Georgia, "Times New Roman", serif;
      }

      /* The message takes all the space above the date. */
      .message {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
      }

      /* The date keeps its bottom-right home, so a failed art fetch still
         leaves you with a working calendar instead of a dead screen. */
      .fallback-date {
        text-align: right;
        padding: 10px 16px;
        font-size: 18px;
        line-height: 1.3;
      }
      .fallback-date .weekday { font-weight: bold; }
      .fallback-date .full    { font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="screen">
      <div class="message">No artwork available right now.</div>
      <div class="fallback-date">
        <div class="weekday">${today.weekday}</div>
        <div class="full">${today.date}</div>
      </div>
    </div>
  </body>
</html>`;
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      /* Reset default page margins so our 800x480 box is exact. */
      * { margin: 0; padding: 0; box-sizing: border-box; }

      /* The screen itself: a fixed 800x480 white canvas. */
      .screen {
        width: ${SCREEN_WIDTH}px;
        height: ${SCREEN_HEIGHT}px;
        background: #ffffff;
        display: flex;
        flex-direction: column;
        font-family: Georgia, "Times New Roman", serif;
      }

      /* The painting fills the space above the caption. */
      .art {
        flex: 1;                 /* take all remaining vertical space */
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .art img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;     /* show the whole painting, no cropping */

        /* The black & white magic:
           grayscale(1)  -> remove all color
           contrast(1.4) -> deepen darks and brighten lights so it reads
                            well once reduced to pure black/white. */
        filter: grayscale(1) contrast(1.4);
      }

      /* A thin caption strip along the bottom.
         Now a two-column row: artwork details left, today's date right. */
      .caption {
        border-top: 2px solid #000000;
        padding: 10px 16px;
        font-size: 18px;
        line-height: 1.3;

        display: flex;
        justify-content: space-between; /* push the two blocks to opposite edges */
        align-items: flex-start;        /* line their first lines up at the top */
        gap: 16px;                      /* minimum breathing room between them */
      }

      /* Left column: what The Met told us about the painting. */
      .artwork {
        overflow: hidden; /* a very long title clips instead of shoving the date */
      }
      .caption .title { font-style: italic; }
      .caption .meta  { font-size: 14px; }

      /* Right column: today's date. */
      .today {
        text-align: right;
        flex-shrink: 0;      /* never let a long painting title squash the date */
        white-space: nowrap; /* keep "27 July 2026" on one line */
      }
      .today .weekday { font-weight: bold; }
      .today .full    { font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="screen">
      <div class="art">
        <img src="${art.imageUrl}" alt="${art.title}" />
      </div>
      <div class="caption">
        <!-- Left: the painting's own details, straight from The Met. -->
        <div class="artwork">
          <div class="title">${art.title}</div>
          <div class="meta">${art.artist}${art.date ? " · " + art.date : ""}</div>
        </div>

        <!-- Right: today's date — our addition, not from the API. -->
        <div class="today">
          <div class="weekday">${today.weekday}</div>
          <div class="full">${today.date}</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

// ── Wire it together: when someone visits "/", serve a fresh artwork ────────

app.get("/", async (req, res) => {
  const art = await getRandomArtwork();
  res.send(buildPage(art));
});

// ── The /data route: the same facts, with no design attached ───────────────
//
// This is the route TRMNL will eventually poll. It returns DATA only — no
// HTML, no CSS. TRMNL pours these values into a Liquid template you write in
// their dashboard, then renders that to a 1-bit image for the device.
//
// Two naming choices worth noticing:
//
//   - Fields are snake_case, the usual convention in Liquid templates, where
//     you'll write {{ image_url }}, {{ title }}, and so on.
//
//   - `artwork_date` and `today_date` are spelled out in full. This is the
//     same collision we dodged earlier: one is "ca. 1740-45", the other is
//     "July 27, 2026". Vague names here would cause real confusion later.

app.get("/data", async (req, res) => {
  const art = await getRandomArtwork();
  const today = getToday();

  // `found` lets the Liquid template branch with {% if found %}, exactly the
  // way buildPage() branches on `if (!art)`. That's how our calendar fallback
  // survives the trip to the device instead of being left behind here.
  if (!art) {
    return res.json({
      found: false,
      today_weekday: today.weekday,
      today_date: today.date,
    });
  }

  res.json({
    found: true,
    image_url: art.imageUrl,
    title: art.title,
    artist: art.artist,
    artwork_date: art.date,
    today_weekday: today.weekday,
    today_date: today.date,
  });
});

// ── The TRMNL markup contract ──────────────────────────────────────────────
//
// This is what the TRMNL previewer actually asks for. It sends a POST here and
// expects JSON containing FOUR pieces of markup — one per layout — plus an
// optional block of shared CSS.
//
// The four layouts are the different amounts of screen your plugin might get:
//
//   full             the whole 800x480 screen, your plugin alone
//   half_horizontal  a wide, short strip (sharing top and bottom)
//   half_vertical    a tall, narrow column (sharing left and right)
//   quadrant         a small box, one of four plugins on screen
//
// So you don't design one layout and hope. You design all four, deciding what
// gets sacrificed as the space shrinks.

// Titles from The Met can contain characters that would break our HTML — the
// ampersand in "Arms & Armor", for instance. This swaps them for safe
// equivalents so the markup stays valid whatever the API hands us.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Only OUR styles go here. The previewer loads TRMNL's framework CSS itself,
// so `view`, `layout`, and `title_bar` already look right — we don't restyle
// them, we just describe the bits the framework has no opinion about.
const SHARED_STYLES = `<style>
  .art {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;             /* take whatever space the tombstone doesn't need */
    align-self: stretch; /* fill the cross axis, so the img's 100% has a real
                            height to measure against — without this, a row
                            layout leaves the height undefined and the image
                            renders full size and gets cropped */
    min-width: 0;        /* flex items refuse to shrink below their content
                            unless you say so; this lets a wide painting
                            narrow instead of overflowing */
    min-height: 0;
    overflow: hidden;
  }

  .art img {
    /* Filling the box and letting object-fit do the work scales the painting
       down to fit entirely, in both row and column layouts. Never cropped. */
    width: 100%;
    height: 100%;
    object-fit: contain;

    /* Gentler than before. Dithering now does the tonal work, and a hard
       contrast push crushed dark paintings to solid black BEFORE the
       dithering ever got to see them. */
    filter: grayscale(1) brightness(1.1) contrast(1.15);
  }

  /* The "tombstone" — museum term for the label beside a work.
     Title, then artist and date, grouped as one unit near the painting. */
  .tombstone {
    text-align: center;
    padding: 6px 12px 0;
    min-width: 0; /* long titles shrink rather than shoving the painting out */
  }

  /* Italic title follows museum convention for titles of works.
     Size and line budget are set per layout below — see the next block. */
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

  /* ── Per-layout rules ────────────────────────────────────────────────
     One global rule can't work. The same title has very different room in
     a full screen than in a half-width column, so each layout gets its own
     type size and its own line budget before truncating. */

  /* Full: most room, largest type. Two lines keeps the painting dominant. */
  .view--full .tombstone__title  { font-size: 20px; -webkit-line-clamp: 2; }
  .view--full .tombstone__credit { font-size: 14px; }

  /* Half horizontal: TWO COLUMNS, always.
     The painting keeps 45% of the width no matter how long the title runs.
     Without this the label expands unopposed and the image vanishes. */
  .view--half_horizontal .art {
    flex: 0 0 45%;
  }
  .view--half_horizontal .tombstone {
    flex: 1 1 auto;
    text-align: left; /* reads better in a column than centred */
    padding: 0 12px;
  }
  .view--half_horizontal .tombstone__title  { font-size: 15px; -webkit-line-clamp: 3; }
  .view--half_horizontal .tombstone__credit { font-size: 12px; }

  /* Half vertical: narrow but tall. Smaller type, two lines. */
  .view--half_vertical .tombstone__title { font-size: 16px; -webkit-line-clamp: 2; }
</style>`;

// One builder for all four layouts, because they differ by CONTENT, not by
// structure. `showArtist` is the only switch: the artist credit is the first
// thing to cut when space runs short — the painting and the date are the job.
//
// Note where the date lands: `instance` is the title bar's right-hand slot,
// which is exactly the bottom-right position you asked for, handed to us by
// the framework instead of hand-positioned.
function buildView(variant, art, today, { showTitle, showCredit, direction }) {
  // The bottom bar is now the calendar, and it is identical everywhere. The
  // date is the one element that never gets cut, whatever the layout.
  //
  // It only holds one line — the framework fixes it at 40px (32px in mashups)
  // with three horizontal slots — which is exactly why the artwork credit
  // had to move out of it.
  const titleBar = `<div class="title_bar">
    <span class="title">${escapeHtml(today.weekday)}</span>
    <span class="instance">${escapeHtml(today.date)}</span>
  </div>`;

  // No artwork? Degrade to a calendar — same thinking as the HTML fallback.
  if (!art) {
    return `<div class="view view--${variant}">
  <div class="layout layout--col layout--center">
    <div class="tombstone__title">No artwork available</div>
  </div>
  ${titleBar}
</div>`;
  }

  // The tombstone: title first, then artist and date on one line beneath.
  //
  // Note we do NOT add a "circa" prefix — The Met already formats objectDate
  // properly ("ca. 1740-45", "mid-14th century", "200-600 CE"), so anything
  // we prepended would double it up.
  // Title and credit are separate switches now, so each layout can shed one
  // thing at a time as space shrinks rather than dropping the label wholesale.
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

// The POST route the previewer calls.
//
// It sends a bearer token and some metadata about the user and device. We
// don't need either yet, so we ignore the body entirely — but the route must
// accept POST, which is exactly why "Cannot POST /" appeared before this
// existed. Any token works locally; a public deployment should check it.

app.post("/trmnl/markup", async (req, res) => {
  const art = await getRandomArtwork();
  const today = getToday();

  res.json({
    // Full screen: painting on top, full tombstone centred beneath it.
    markup: buildView("full", art, today, {
      showTitle: true,
      showCredit: true,
      direction: "layout--col",
    }),

    // Wide and short, so the tombstone sits BESIDE the painting rather than
    // under it — a row uses that shape far better than a column would.
    markup_half_horizontal: buildView("half_horizontal", art, today, {
      showTitle: true,
      showCredit: true,
      direction: "layout--row",
    }),

    // Narrow, but still tall: room for the title, not for a second line.
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
  });
});

// ── Start the server ───────────────────────────────────────────────────────

app.listen(PORT, async () => {
  await loadObjectIDs(); // fill our candidate list before we take visitors
  console.log(`Art dashboard running at http://localhost:${PORT}`);
  console.log(
    `Now run:  npx trmnl-plugin-preview --target http://localhost:${PORT}`
  );
});
