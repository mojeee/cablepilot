# Changelog

## Unreleased

### M2 Devices and cross-references

- Devices: every symbol, box and assembly outline with the same full designation (function and location
  aspects plus product part) is one device. A coil and its contacts, or a breaker drawn on a single-line and
  on a multi-line page, are representations of one device: counted once in the BOM and cross-referenced both
  ways. Main and auxiliary functions are counted per device.
- Cross-references with a configurable format (page.column such as `8.3`, or page-column-row such as `08-E3`)
  from the frame zones of the page; contact images under coils (make, break and power contacts with their
  positions) with an optional note on the shown state; references at contacts and representations.
- Interruption points carrying a signal or potential name, joining nets across pages (`netGroups`).
- Black boxes and connectors with numbered, named pins as pin-level connection points; mated plug and socket
  pairs join pins of the same number; boxes move with their wires.
- Nested assemblies: a dashed outline carrying the assembly designation, devices mounted on it, grouped in
  the BOM. Macros: groups of symbols, boxes and wires saved to the company library and placed again with
  fresh designations (one ships: an alarm relay stage).
- Parts: 98 generic parts in `library/parts` (contactors, relays, breakers, motor protection, terminals, PLC
  cards, cables, enclosures, batteries, diodes, rectifier and inverter modules, DC/DC converters, hall
  sensors, EMI filters, transformers with vector group, phase-monitoring relays, HMI, switches, RJ45),
  assigned to devices (several per device) and as project parts with no designation.
- BOM generated live with configurable columns and user fields, units to build, CSV export; incremental page
  scans. Project file format version 2 (migration from 1 included), JSON Schema updated.
- New symbols: interruption point, one-pole contactor, six-terminal motor, Hall sensor, EMI filter.
- Samples rebuilt with devices, parts and cross-references and laid out across the sheet: the pump station
  has star-delta starters, the charger has a nested switching block, connectors with pins, black boxes, a
  macro, interruption points, the A-H, M-U frame with rows 0-9 and a full BOM.
- Fixed: opening a sample named the wrong project in the message list.

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
