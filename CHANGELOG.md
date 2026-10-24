# Changelog

## Unreleased

### Demo video

- Demo video: `npm run record:demo` records the battery-charger story from the real built app (Playwright,
  1920 x 1080, visible pointer, zoom-ins, print preview) and encodes `site/video/demo.webm` and `demo.mp4`, a
  15 s muted hero loop, poster and step frames in `site/img/`, and captions in English and Italian
  (`demo.en.vtt`, `demo.it.vtt`). The landing page hero plays the loop; `/demo/` and `/it/demo/` are built from
  `docs/demo.md` and `scripts/site/demo.it.md`. `npm run check:site` fails when a file of the recording is missing.
- Input fields in the wire-class and wire-type tables are readable in the dark theme (they were white on white).

### M4 Checks and revisions

- Electrical rule check, continuous and incremental (only the page that changed is rechecked): duplicate
  designations, unconnected wire ends, coils without contacts and contacts without a coil, more contacts used than
  the parts provide, two potentials connected together (also across pages), conductor cross-section against the
  protective device and the stated installation method (IEC 60364-5-52; assumptions shown, table values flagged
  unverified in `docs/to-verify.md`, never a replacement for the engineer's verification), conductor colour against
  potential type (IEC 60204-1, IEC 60445), missing PE connection, more wires on a terminal than allowed, PLC
  address used twice. Every rule cites its standard and clause.
- Findings appear as a marker on the page, in the message list and in a warnings banner, with a one-click fix
  (undoable) for plain edits and "Fix all that can be fixed" as one undo step. New project setting: installation
  method of the conductors.
- Revisions: issue status of the set (for proposal, approval, construction, as built); issue a revision (number,
  date, description, drawn, checked, approved) with a snapshot of every page, device, wire and part; changed pages
  since the last issue are marked and listed; compare two revisions (or the working copy). The title-block
  revision field follows each sheet's last revision.
- Generated cover sheet: sheet index with the revision of every sheet, revision list, issue status boxes, units to
  build and customer approval and signature block; the contents page shows each sheet's revision.
- Project file format version 4 (migration from 3), JSON Schema updated.
- Samples open with a clean check and revision 0 issued; the charger has revisions 0 and 1 with a changed page.
  They gained potential tags, PE feeds, PLC field terminals, sized conductors and auxiliary blocks.
- Website: the "Checks and revisions" block and the cover sheet show screenshots of the real app.

### M3 Wires and reports

- Automatic wire numbering from the nets: by potential (one counter per potential, suffix from the wire
  class: `020L+`, `005U`), by page and column, or sequential, with a configurable pattern (`{n:3}{suffix}`,
  `{page:2}.{col}.{n}`), start and step. Nets joined by interruption points share one number; numbers typed
  by hand stay; numbers are drawn along the wire, rotated on vertical wires. Renumbering is one undoable command.
- Company wire-class table (function, colour, cross-section, type, suffix), named wire types, conductors drawn
  in their IEC 60757 colour (option; green-and-yellow with a stripe), one label for a bundle ("10 mm² BK").
- Terminals and terminal strips from the schematic (automatic strip and number on placement, renumber
  command); cables with cores and core colours, flat ribbon and RJ45 patch cables between connectors; wires can
  name a cable and a core. Cables with a part go into the BOM; terminal parts count once per terminal.
- Live reports (cached per page, incremental): terminal diagram (destination, function, part, strip length),
  cable list, wire list, connector pin lists, BOM, contents, symbol legend (used symbols only), conductor
  colour and wire-suffix tables, terminal tightening-torque table (generic values flagged "to be verified"),
  nameplates (drawn as labels and listed), wire-marker and terminal-marker lists. Report elements draw on
  any page; new terminal, cable, BOM and "lists and tables" page types; reports continue on extra pages.
- Exports: CSV per list, one XLSX workbook with every list (our own writer, no dependency), DXF export of a
  page and DXF import as plain graphics (own reader and writer), the full PDF set with every page.
- Fixed: PDF text did not render in viewers without Helvetica; the font (Roboto, SIL OFL) is now embedded.
- Fixed: the top bar overflowed on narrower windows and hid the theme and language selectors; it wraps now.
- Project file format version 3 (migration from 2), JSON Schema updated. Samples rebuilt with wire numbers,
  terminal strips, cables and reports; the charger's input and PLC pages are laid out across the sheet and it
  gets the colour and suffix tables, legend, torque table and nameplates.
- Website: `npm run screenshots` captures the real app (dark and light) into `site/img/`; the landing page
  shows the screenshots for the available features and the drawing-set strip.

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
