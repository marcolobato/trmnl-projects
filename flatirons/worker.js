// ─────────────────────────────────────────────────────────────────────────
// flatirons/worker.js
//
// The Cloudflare Worker — this is what deploys, and what TRMNL polls once
// you stop using a tunnel.
//
// It is deliberately tiny. Everything it needs to decide lives in scene.js,
// and everything it needs to draw lives in markup.js. All this file does is
// turn an HTTP request into a Date and a Date into a Response.
//
// Compare it with art-dashboard/worker.js, which has to fetch from The Met
// and cope with that failing. This one has no upstream to call — the whole
// screen comes from the clock — so there is nothing here to go wrong and no
// error path to write. That is the payoff for the stateless design.
// ─────────────────────────────────────────────────────────────────────────

import { buildScene, PLATES } from "./scene.js";
import { buildMarkupResponse } from "./markup.js";

// Where the PNGs actually live. The Worker fetches them from here itself and
// re-serves them from its own domain — see the /plate route below.
const GITHUB_PLATES =
  "https://raw.githubusercontent.com/marcolobato/trmnl-projects/main/images/flatirons";

// Time travel, same as the local server. Handy for checking dusk from a
// phone without waiting for dusk. Falls back to now if the value is junk,
// because a malformed query string should never blank the screen.
function resolveTime(url) {
  const t = url.searchParams.get("t");
  if (!t) return new Date();
  const parsed = new Date(t);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // TRMNL polls with GET; the local preview tool POSTs. Both get the same
    // answer — see the matching note in server.js.
    // ── The plates, served from OUR domain ────────────────────────────────
    //
    // Why proxy instead of pointing the markup straight at GitHub: TRMNL
    // renders the page on their servers, and we can't assume their renderer
    // is willing or able to fetch a third-party host. Serving the images
    // from the same origin as the markup removes that entire question, and
    // also removes a dependency on GitHub staying reachable.
    //
    // The Worker fetching GitHub is a different matter — that's a
    // server-to-server call with none of a renderer's restrictions.
    if (url.pathname.startsWith("/plate/")) {
      const name = url.pathname.slice("/plate/".length).replace(/\.png$/, "");

      // Whitelist, not passthrough. Without this, /plate/../../anything
      // would turn the Worker into an open proxy for any URL.
      if (!PLATES.includes(name)) {
        return new Response("Unknown plate", { status: 404 });
      }

      const upstream = await fetch(`${GITHUB_PLATES}/${name}.png`, {
        // Cache at Cloudflare's edge for a day. The plates only change when
        // we regenerate them, so there's no reason to hit GitHub per refresh.
        cf: { cacheTtl: 86400, cacheEverything: true },
      });

      if (!upstream.ok) {
        return new Response("Plate unavailable", { status: 502 });
      }

      return new Response(upstream.body, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=86400",
        },
      });
    }

    if (url.pathname === "/") {
      // Point the markup at our own /plate route rather than at GitHub.
      const scene = buildScene(resolveTime(url), {
        plateBase: `${url.origin}/plate`,
      });

      return Response.json(buildMarkupResponse(scene), {
        headers: {
          // The screen changes every 75 minutes at most, but the message and
          // plate change on the hour, so don't let anything cache this for
          // long. TRMNL asks on its own schedule anyway.
          "cache-control": "no-store",
        },
      });
    }

    // A human-readable check, so you can tell at a glance whether a deploy
    // worked without reading JSON.
    if (url.pathname === "/health") {
      const scene = buildScene(resolveTime(url));
      return new Response(
        [
          `flatirons ok`,
          `${scene.local.dateKey} ${String(scene.local.hour).padStart(2, "0")}:${String(
            scene.local.minute
          ).padStart(2, "0")} ${scene.local.weekday}`,
          `plate    ${scene.plate}`,
          `revealed ${scene.revealedCount}/12`,
          `message  ${scene.message}`,
        ].join("\n"),
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
