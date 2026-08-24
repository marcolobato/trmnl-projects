// ─────────────────────────────────────────────────────────────────────────
// art-dashboard/worker.js
//
// The Cloudflare Worker — this is what actually deploys and what TRMNL calls.
//
// It handles only two things: fetching a painting from The Met, and routing
// requests. Everything about how the plugin LOOKS lives in markup.js, shared
// with server.js.
//
// Written for a different runtime than server.js, which meant three changes:
//
//   1. No Express. Workers hand you a `fetch` function and expect a Response.
//   2. No startup step. A Worker spins up per request and vanishes, so the
//      artwork ID list can't be loaded once at boot.
//   3. No local clock. Workers run on UTC — handled by the TIME_ZONE
//      constant in markup.js.
// ─────────────────────────────────────────────────────────────────────────

import { getToday, buildMarkupResponse } from "./markup.js";

const SEARCH_URL =
  "https://collectionapi.metmuseum.org/public/collection/v1/search" +
  "?q=landscape&hasImages=true";

const OBJECT_URL =
  "https://collectionapi.metmuseum.org/public/collection/v1/objects/";

// ── Talking to The Met safely ──────────────────────────────────────────────
//
// Every call to The Met goes through here now.
//
// The old code called `await response.json()` directly, with nothing to catch
// it if that failed — and it CAN fail. The Met sits behind Imperva bot
// protection, which sometimes answers a request from a datacenter (which is
// what a Cloudflare Worker is) with an HTML "are you a robot" page instead of
// JSON. Calling .json() on HTML throws, and an uncaught throw inside a Worker
// is automatically turned into an HTTP 500 by Cloudflare.
//
// This wrapper converts all of those failures into `null` instead — a value
// the code below already knows how to cope with.

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      // A bare Worker fetch sends no User-Agent at all, which is one of the
      // things bot protection scores against you. Naming ourselves honestly
      // is both politer and less likely to be challenged.
      "user-agent": "art-dashboard-trmnl/1.0 (TRMNL e-ink plugin)",
      accept: "application/json",
    },
  });

  // Case 1: The Met answered, but with an error status (403, 429, 503...).
  if (!response.ok) {
    console.error(`Met API replied ${response.status} for ${url}`);
    return null;
  }

  // Case 2: The Met answered 200, but the body isn't JSON. This is the
  // Imperva challenge-page case, and it's the one that used to throw.
  try {
    return await response.json();
  } catch {
    console.error(`Met API sent something that isn't JSON for ${url}`);
    return null;
  }
}

// ── Getting the candidate list ─────────────────────────────────────────────
//
// server.js loads this once when the server starts. A Worker has no "start",
// so we fetch it on demand.
//
// This variable lives at module level, which means it MAY survive between
// requests that happen to reuse the same instance — a free speed-up when it
// works, harmless when it doesn't. It is a best-effort cache, never a
// guarantee, so the code below must be correct either way.

let cachedIDs = null;

async function getObjectIDs() {
  // `cachedIDs?.length` rather than plain `cachedIDs`.
  //
  // This looks like a nitpick and isn't. An empty array is TRUTHY in
  // JavaScript — `if ([])` runs. So if the search ever came back empty, the
  // old check would hand that empty array back forever, and this Worker
  // instance would serve "No artwork available" until Cloudflare happened to
  // recycle it. Checking `.length` means we only trust a cache with real
  // contents, and retry on the next request otherwise.
  if (cachedIDs?.length) return cachedIDs;

  const data = await fetchJson(SEARCH_URL);

  // `data?.objectIDs` — the `?.` matters because fetchJson returns null on
  // failure. The Met also returns `objectIDs: null` for a search with zero
  // hits, which the `|| []` catches.
  cachedIDs = data?.objectIDs || [];
  return cachedIDs;
}

// ── Picking one public-domain artwork ──────────────────────────────────────
// Try a few at random until one is both public domain and has a real image.

async function getRandomArtwork() {
  const MAX_TRIES = 8;
  const objectIDs = await getObjectIDs();

  if (objectIDs.length === 0) return null;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const id = objectIDs[Math.floor(Math.random() * objectIDs.length)];

    // fetchJson already handles the bad-status and bad-body cases, so the
    // two checks that used to live here have collapsed into one. A null just
    // means "that one didn't work" — try the next ID.
    const art = await fetchJson(OBJECT_URL + id);
    if (!art) continue;

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

// ── The Worker entry point ─────────────────────────────────────────────────
//
// Express gave us app.get() and app.post(). A Worker gives us ONE function
// for every request, so we read the path and method ourselves.

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // The route TRMNL and the previewer call.
    //
    // Deliberately answers ANY method, not just POST. The local previewer and
    // TRMNL's marketplace flow both send POST, but TRMNL's polling strategy
    // defaults to GET — and a 404 on GET is exactly why the first poll came
    // back with no data. Accepting both means the default setting just works.
    if (url.pathname === "/trmnl/markup") {
      // Worked out FIRST, and deliberately outside the try below, so that the
      // failure path still has a real date to show. The date needs no network
      // and can't fail, so it's safe out here.
      const today = getToday();

      // The safety net.
      //
      // A Cloudflare Worker that throws returns a bare HTTP 500 — which is
      // exactly what TRMNL reported, and why the plugin went "degraded".
      // Catching here means a Met outage, a change to their response shape,
      // or a bug of ours can no longer do that.
      //
      // Instead we answer 200 with the "no artwork" layout, which already
      // exists in markup.js. The screen falls back to a clean calendar for
      // one refresh, and picks up a painting again on the next one — with no
      // intervention from you.
      try {
        const art = await getRandomArtwork();

        // Not an error, but worth seeing in `wrangler tail`: it means The Met
        // answered fine and simply had nothing public-domain in our sample.
        if (!art) {
          console.warn("No public-domain artwork found after 8 tries");
        }

        return Response.json(buildMarkupResponse(art, today));
      } catch (error) {
        // `error.stack` gives the line number that actually failed, which is
        // the thing you'll want when reading `npx wrangler tail`.
        console.error("markup route failed:", error?.stack || error);
        return Response.json(buildMarkupResponse(null, today));
      }
    }

    // A plain GET so you can open the URL in a browser and confirm it's alive.
    //
    // It now also says where the source lives and how to watch the logs.
    // When this next misbehaves — possibly months from now — this page is the
    // first thing you'll reach for, and it can point you at everything else.
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        [
          "Art dashboard worker is running.",
          "",
          "Markup endpoint : /trmnl/markup  (accepts GET and POST)",
          "Source          : trmnl-projects/art-dashboard/ (worker.js + markup.js)",
          "Live logs       : npx wrangler tail",
          "Redeploy        : npx wrangler deploy",
          "",
          "If TRMNL says 'degraded', check `wrangler tail` first — the Worker",
          "logs the reason and falls back to a calendar rather than erroring.",
        ].join("\n"),
        { headers: { "content-type": "text/plain" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
