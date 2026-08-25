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

import { buildScene } from "./scene.js";
import { buildMarkupResponse } from "./markup.js";

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
    if (url.pathname === "/") {
      const scene = buildScene(resolveTime(url));

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
