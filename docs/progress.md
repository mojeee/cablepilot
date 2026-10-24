# Progress

One entry per milestone: what works, what is left, and anything the owner must do by hand.

## M0 Scaffold (done)

**What works**

- `npm run dev` opens the app: top bar (disabled Open, Save, Undo, Redo, Export PDF; theme, canvas
  colour and language switches), page navigator with eight sample pages, symbol and device browser
  (categories, empty library notice), a Canvas 2D page area with an A3 frame, zone labels, wheel
  zoom, drag pan and "Fit page", a properties panel, and a message list.
- Dark and light themes; dark or white canvas; English and Italian for every string; the choices
  are saved in the app's settings file.
- Security: `contextIsolation` on, `nodeIntegration` off, sandbox on, typed preload API
  (`window.cablepilot`) returning `{ ok, value | error }` results.
- Tests: Vitest (i18n completeness and placeholders, sheet sizes, settings parsing, library colour
  codes, roadmap shape) and a Playwright smoke test of the built app.
- CI: typecheck, unit tests, licence check, library check, build (writes THIRD_PARTY_LICENSES.md),
  site rebuild plus "committed site is up to date", and an e2e job under xvfb.
- Website skeleton in `site/` (English at `/`, Italian at `/it/`): landing page with all sections of
  the brief (placeholders where content comes later), "For companies", 404, sitemap, robots,
  `_headers`, `_redirects`. The status line, Available/Planned tags and the AI wording come from
  `docs/roadmap.md`.

**What is left**

- Everything product: the schematic editor starts with M1. No project model, commands, library
  symbols, samples, exports or AI exist yet.
- Website: screenshots, demo recording and page, docs, SEO pages and standards tables (M8, with the
  pieces they depend on). The Open Graph image is an SVG placeholder.
- Packaging (electron-builder) and release builds: M8.
- `docs/to-verify.md` lists three items to check against the standards (sheet sizes, frame margins,
  IEC 60757 colour codes).

**What the owner must do by hand**

- Push `main` and create the public GitHub repository `mojeee/cablepilot` when ready (nothing was
  pushed or tagged).
- Cloudflare Pages one-time setup: see the end of `docs/website.md`.
- Turn on GitHub Discussions (the site links to it) and create the `good first issue` label.
- Enable GitHub private vulnerability reporting (SECURITY.md points to it).
- Run `npm run test:e2e` locally once; it passed on macOS during M0, but the Linux xvfb job in CI has
  not run yet.
