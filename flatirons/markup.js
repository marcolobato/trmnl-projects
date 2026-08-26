// ─────────────────────────────────────────────────────────────────────────
// flatirons/markup.js
//
// Everything about how the plugin LOOKS. Nothing about where it runs.
// Both server.js (local preview) and worker.js (production) import this, so
// a layout tweak is made once and both get it.
//
// The dividing line that matters here:
//
//     the IMAGE carries pixels        the DOM carries text
//
// The plate is a pre-dithered PNG. The message and date are real HTML using
// TRMNL's own text classes. We deliberately do NOT draw text into the image,
// because text baked at 800x480 was exactly the bug art-dashboard already
// fixed once — it looked right on OG and far too small on TRMNL X.
// ─────────────────────────────────────────────────────────────────────────

import { ART_W, ART_H, REMINDER_CARD } from "./scene.js";

// Titles and messages can contain characters that would break our HTML.
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Styles ─────────────────────────────────────────────────────────────────
//
// Only OUR styles go here. TRMNL loads its framework CSS itself, so `view`,
// `layout` and `title_bar` are already handled — we only describe the parts
// the framework has no opinion about.

export const STYLES = `<style>
  /* The art area, 780x420 — what the framework leaves after the 10px gap
     and the 40px title bar. Fixed pixels so the plate is never rescaled;
     resampling an ordered dither is what turns it to mush. */
  .scene {
    position: relative;
    width: ${ART_W}px;
    height: ${ART_H}px;
    overflow: hidden;
  }

  .scene__plate {
    display: block;
    width: ${ART_W}px;
    height: ${ART_H}px;

    /* The plate is ALREADY dithered to 8 tones. Note there is no
       "image-dither" class on it — running TRMNL's dithering over an
       already-dithered image would beat one pattern against the other and
       produce moire. This is the one place we opt out of the framework. */
    image-rendering: pixelated;
  }

  /* The reminder card. Not yet used, but the geometry is measured rather
     than guessed: REMINDER_CARD sits entirely inside the pasture zone, the
     brightest and least detailed part of the frame. */
  .scene__reminder {
    position: absolute;
    left: ${REMINDER_CARD.x}px;
    top: ${REMINDER_CARD.y}px;
    width: ${REMINDER_CARD.w}px;
    height: ${REMINDER_CARD.h}px;
    background: #fff;
    border: 3px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 16px;
    text-align: center;
  }
</style>`;

// ── The page ───────────────────────────────────────────────────────────────

export function buildView(scene, { debug = false } = {}) {
  // The whole plate, every refresh. The tile grid that used to sit over this
  // is parked behind REVEAL_ENABLED in scene.js — see the note there.
  const reminder = scene.reminder
    ? `<div class="scene__reminder">${escapeHtml(scene.reminder)}</div>`
    : "";

  // The encouragement goes in the title bar's left slot, the date on the
  // right — the same two-slot pattern art-dashboard already uses, so the
  // two plugins read as siblings rather than strangers.
  const titleBar = `<div class="title_bar">
      <span class="title">${escapeHtml(scene.message)}</span>
      <span class="instance">${escapeHtml(scene.local.longDate)}</span>
    </div>`;

  // Local-preview only. Never rendered in production.
  const debugBar = debug
    ? `<div style="position:absolute;top:0;left:0;background:#000;color:#fff;
         font:11px ui-monospace,monospace;padding:2px 6px;z-index:10;">
         ${escapeHtml(scene.local.dateKey)}
         ${String(scene.local.hour).padStart(2, "0")}:${String(scene.local.minute).padStart(2, "0")}
         · ${escapeHtml(scene.plate)}
       </div>`
    : "";

  return `<div class="view view--full">
    <div class="layout">
      <div class="scene">
        ${debugBar}
        <img class="scene__plate"
             src="${escapeHtml(scene.plateUrl)}"
             alt="The Boulder Flatirons, ${escapeHtml(scene.time)}, ${escapeHtml(scene.weather)}" />
        ${reminder}
      </div>
    </div>
    ${titleBar}
  </div>`;
}

// ── What TRMNL actually receives ───────────────────────────────────────────
//
// A polling plugin does NOT return an HTML page. It returns JSON holding one
// markup fragment per layout, plus a `shared` block of CSS. TRMNL supplies
// the document, its framework stylesheet, and the screenshot-to-1-bit step.
//
// Only `markup` is filled for now. The other three layouts need their own
// crops of the plate — a landscape panorama doesn't reduce into a 400px-wide
// column by scaling — so they come in a later step rather than shipping
// something squashed.

export function buildMarkupResponse(scene, options) {
  return {
    // ── For the Liquid template in TRMNL's markup editor ──────────────────
    //
    // TRMNL's normal model is: your endpoint returns DATA, and a Liquid
    // template in their editor turns it into markup. These are the variables
    // that template reads. See template.liquid.
    //
    // `tiles` is an array of objects rather than a list of revealed indexes
    // because Liquid has no clean way to ask "does this array contain 7?".
    // Twelve small objects, each already knowing its own answer, keeps the
    // template to a single loop with no lookups.
    plate: scene.plate,
    time_of_day: scene.time,
    weather: scene.weather,
    plate_url: scene.plateUrl,
    message: scene.message,
    weekday: scene.local.weekday,
    date_long: scene.local.longDate,
    date: scene.local.dateKey,

    // ── For rendering without a template ──────────────────────────────────
    //
    // Kept so the endpoint still works with an empty markup editor, which is
    // how art-dashboard runs. Harmless when a template IS present — it just
    // becomes a variable nobody reads.
    markup: buildView(scene, options),
    shared: STYLES,
  };
}
