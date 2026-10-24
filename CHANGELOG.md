# Changelog

## Unreleased

### M1 Schematic editor

- Project model as pure data in `shared/`, saved as versioned JSON (`*.cablepilot.json`) with a JSON Schema,
  migrations and a stable key order that diffs well in Git. Autosave and crash recovery.
- Command layer: every edit is a command with undo and redo (place, move, rotate, mirror, wires, pages,
  templates, settings, automatic renumbering).
- Pages: cover, contents, power, control, PLC, terminals, cables, layout, single-line (n-conductor tick
  marks) and project data pages (forms and tick boxes filled from project and IEC 61439 assembly data).
  Cover and contents are generated from the project.
- Page frames with configurable zone labels (for example A to H, then M to U, skipping O and Q), sheet sizes
  A4 to A0, company templates (frame, title block with logo, margin text) stored in the project and in a
  company library; title-block fields fill in automatically.
- Drawing styles (colours per element type, line weights, fonts), print preview always on white, and a
  drawing language per project separate from the UI language.
- IEC 60617 starter library of 35 symbols as data files in `library/symbols`, NFPA 79 / ANSI alternative
  graphics for ten of them, an in-app symbol editor and `npm run check:library -- <folder>` for company
  libraries.
- Orthogonal wires with auto-connect, junctions and rubber-band following; potentials (L1, L2, L3, N, PE,
  L+, L-, 24 V DC, 0 V, 110 V DC); connectivity (nets and potentials) computed from the model.
- IEC 81346 designations with automatic numbering per location (+DS, +MO...).
- Free annotation: rotated multi-line text, lines, rectangles, dashed outlines, tables, PNG, JPEG and SVG
  images and four warning signs drawn by us.
- Vector PDF export of pages at true scale (pdf-lib), keyboard shortcuts (F1 lists them).
- Three sample projects: conveyor, pump station, 110 V DC charger with Italian drawing texts.
- Fixed from M0: the canvas status message is no longer cut off, frame zones are configurable.

### M0 Scaffold

- The app opens with its main layout: top bar, page navigator, canvas with a page frame, properties
  panel, symbol and device browser, and a message list. Dark and light themes, dark or white canvas.
- English and Italian for every UI string, checked by a test.
- Typed preload API, `contextIsolation` on, `nodeIntegration` off, sandbox on.
- CI: typecheck, unit tests, licence check (fails on GPL and AGPL), library check, build, site check.
- Website skeleton in English and Italian: landing page, "For companies", 404, sitemap, headers.
- Apache-2.0 licence, NOTICE, CONTRIBUTING (DCO), code of conduct, security policy, templates.
