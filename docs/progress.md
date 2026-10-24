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

## M1 Schematic editor (done)

**What works**

- Open, save, save as, autosave with crash recovery; New, three sample projects, undo and redo for every
  edit, keyboard shortcuts (F1 lists them).
- Pages of ten types (cover and contents are generated, data pages are forms filled from project and IEC
  61439 data), A4 to A0, frames with configurable zone labels, company templates (title block with logo,
  margin text), drawing styles, drawing language separate from the UI language, print preview on white.
- Editing: 35 IEC 60617 symbols (ten with NFPA / ANSI alternatives), place / move / rotate / mirror,
  orthogonal wires with junctions and rubber-band, potentials, IEC 81346 designations with automatic
  numbering and renumbering, annotation (text, lines, rectangles, dashed outlines, tables, images, warning
  signs), in-app symbol editor saving to the company library.
- Connectivity (nets and potentials) computed from the model; vector PDF export at true scale.
- Tests: model, commands and undo, connectivity, numbering, file format and migrations, JSON Schema, drawing,
  PDF, picking, library, samples, a 500-page performance budget, and six end-to-end tests.

**What is left**

- Terminal, cable and layout pages have no generated content yet (M3, M6); devices with several symbols,
  cross-references and interruption points are M2; wire numbering, wire types and reports are M3; the
  electrical rule check is M4.
- The pump-station sample has two direct-on-line starters; the star-delta starter needs M2 devices.
- Title-block cell positions are data in the template but have no editor yet; the PDF content streams are not
  compressed; the default frame and title block values are placeholders (docs/to-verify.md).
- Symbol letters, symbol parts and NFPA alternatives are marked `secondary` and listed in docs/to-verify.md.

**What the owner must do by hand**

- Check the new rows of `docs/to-verify.md` against ISO 5457, ISO 7200, IEC 60617, IEC 81346-2, IEC 61439-1,
  NFPA 79 and ISO 128-2 when the standards are at hand.
- Run `npm run test:e2e` locally and in CI once (it passed locally on macOS; the Linux xvfb job has not run).
- Look at the three samples in the app and say what should change before they are used for the website demo.

