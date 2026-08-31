# trmnl-projects

A series of small [TRMNL](https://trmnl.com) e-ink plugins, built to learn the platform one capability at a time.

Each phase lives in its own folder so the repo grows without getting tangled.

## Phases

| Phase | Folder | What it does |
|---|---|---|
| 1 — Art | `art-dashboard/` | Fetches a public-domain painting from The Met and renders it for a 1-bit (black & white) e-ink screen. |
| 2 — Flatirons | `flatirons/` | A photo of the Boulder Flatirons that changes with the time of day and the weather, over a line of text nudging you outside. Sunrise and sunset are calculated, not fetched. Learns 4-bit greyscale and pre-dithered images. |
| 3 — Half-screen | _planned_ | Painting on one half, a runner's quote on the other. Learns TRMNL layout variants. |
| 4 — Focus timer | _planned_ | A focus timer with a QR-code companion flow. Learns e-ink "interactivity." |
| 5 — Strava | _planned_ | Next workout and kudos from followers. Learns OAuth. |

## Running a phase locally

You need [Node.js](https://nodejs.org) (v18 or newer).

```bash
npm install          # one time: downloads the one dependency (express)
npm run art          # phase 1, at http://localhost:3000
npm run flatirons    # phase 2, at http://localhost:3000
```

Phase 2 also has a plain browser preview at `http://localhost:3000/preview`,
and both servers accept `?t=2026-08-25T19:30` to travel in time.

Then, in a second terminal window, start the TRMNL previewer and point it at the server:

```bash
npx trmnl-plugin-preview --target http://localhost:3000
```

It opens at `http://127.0.0.1:4568` and shows your page as a pixel-accurate 1-bit render, in every TRMNL layout and device size.
