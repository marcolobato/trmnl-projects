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
  if (cachedIDs) return cachedIDs;

  const response = await fetch(SEARCH_URL);
  const data = await response.json();
  cachedIDs = data.objectIDs || [];
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
