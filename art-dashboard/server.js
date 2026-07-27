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

// ── Start the server ───────────────────────────────────────────────────────

app.listen(PORT, async () => {
  await loadObjectIDs(); // fill our candidate list before we take visitors
  console.log(`Art dashboard running at http://localhost:${PORT}`);
  console.log(
    `Now run:  npx trmnl-plugin-preview --target http://localhost:${PORT}`
  );
});
