// ─────────────────────────────────────────────────────────────────────────
// flatirons/server.js
//
// The local preview server. This is NOT what deploys — worker.js is. This
// exists so you can see the plugin without pushing anything.
//
// Two routes, because there are two ways you'll want to look at it:
//
//   /          the JSON that TRMNL actually consumes. Point
//              `npx trmnl-plugin-preview` here for a pixel-accurate
//              1-bit render at real device size.
//
//   /preview   a plain HTML page. Not pixel-accurate — your browser is not
//              e-ink — but instant, and fine for checking layout.
//
// Both accept ?t= to travel in time:
//
//   http://localhost:3000/preview?t=2026-08-25T19:30
//
// Without that you would have to wait 75 real minutes to see the next tile
// appear, which is not a way to work.
// ─────────────────────────────────────────────────────────────────────────

import express from "express";
import { buildScene, TILES } from "./scene.js";
import { buildView, buildMarkupResponse, STYLES } from "./markup.js";

const app = express();
const PORT = 3000;

// ── Time travel ────────────────────────────────────────────────────────────
//
// `?t=2026-08-25T19:30` is read as LOCAL wall-clock time, which is what you
// mean when you type it. Anything unparseable falls back to now rather than
// throwing — a broken query string shouldn't blank the screen.

function resolveTime(query) {
  if (!query.t) return new Date();
  const parsed = new Date(query.t);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

// ── The route TRMNL and the previewer use ──────────────────────────────────

app.get("/", (req, res) => {
  const scene = buildScene(resolveTime(req.query));
  res.json(buildMarkupResponse(scene));
});

// ── The route your eyes use ────────────────────────────────────────────────

app.get("/preview", (req, res) => {
  const scene = buildScene(resolveTime(req.query));

  // TRMNL's framework CSS normally supplies `view`, `layout` and
  // `title_bar`. It isn't loaded here, so this page draws just enough of
  // them to be legible. Deliberately minimal — if this file starts growing
  // its own design, the preview has stopped telling the truth.
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Flatirons preview</title>
  <style>
    body {
      margin: 0; padding: 24px; background: #d9d7d1;
      font-family: ui-monospace, monospace;
      display: flex; flex-direction: column; align-items: center; gap: 16px;
    }
    /* The real screen: 800x480, art on top, title bar in the last 48px. */
    .view--full {
      width: 800px; height: 480px; background: #fff;
      display: flex; flex-direction: column;
      outline: 1px solid rgba(0,0,0,.25);
    }
    .layout { flex: 1; }
    .title_bar {
      height: 48px; flex: 0 0 48px;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 16px; font-size: 20px; font-weight: 600;
      border-top: 2px solid #000;
    }
    .readout { font-size: 12px; color: #333; }
    .readout a { color: #000; }
  </style>
  ${STYLES}
</head>
<body>
  ${buildView(scene, { debug: true })}
  <div class="readout">
    ${scene.local.dateKey} ${String(scene.local.hour).padStart(2, "0")}:${String(
      scene.local.minute
    ).padStart(2, "0")} ·
    plate <b>${scene.plate}</b> ·
    ${scene.revealedCount}/${TILES} uncovered ·
    order [${scene.order.join(" ")}]
    &nbsp;&nbsp;
    <a href="/preview?t=2026-08-25T06:00">06:00</a>
    <a href="/preview?t=2026-08-25T12:00">12:00</a>
    <a href="/preview?t=2026-08-25T18:30">18:30</a>
    <a href="/preview?t=2026-08-25T22:00">22:00</a>
  </div>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Flatirons preview running:`);
  console.log(`  browser  http://localhost:${PORT}/preview`);
  console.log(`  JSON     http://localhost:${PORT}/`);
  console.log(``);
  console.log(`  device-accurate render:`);
  console.log(`  npx trmnl-plugin-preview --target http://localhost:${PORT}`);
});
