# Changelog

## Unreleased

### M6 part 1: Sizing and warehouse

- Load and feeder data on devices (motor power, current, cos phi, efficiency, starter, breaker curve, load current,
  feeder length), project supply data (voltage, prospective short-circuit current, ambient temperature, grouping,
  voltage-drop limit) next to the installation method, and a manual length on wires. File format 6 (migration 5 to 6).
- Sizing engine in `shared/sizing.ts` (pure functions, API documented for the AI of M7): design current, cable
  current-carrying capacity with ambient and grouping factors (IEC 60364-5-52), Ib <= In <= Iz and I2 <= 1.45 Iz
  (IEC 60364-4-43), voltage drop, breaker (rating, curve, poles, Icu, IEC 60947-2), contactor (AC-3) and overload relay
  (IEC 60947-4-1). Every result carries its requirement, assumptions and the table values that are still unverified
  (`docs/to-verify.md`), and says it does not replace the engineer's verification. The cross-section check uses the same
  factors.
- Warehouse: import a stock list from CSV or XLSX through a column-mapping wizard saved per company, refresh from the
  file or a watched folder (main process), stock date and an "old" flag, links to library parts by part code or by
  hand, "data missing" for items without technical data; a generic sample stock list.
- Sizing window ("Size the whole project" review table and a suggestion panel per line): only parts that meet the
  requirement, ranked in stock and enough, in stock but short, not in stock, each with warehouse, location and the
  quantity available for this project; confirm a line or accept all in one undo step.
- BOM stock columns (on hand, available, short, location), shortages, an old stock list and parts lost in a refresh in the
  message list, picking-list export (CSV and XLSX). Generic parts got the technical fields sizing needs and a 12 to
  18 A overload relay; the conveyor and pump samples carry load data and ship sized.
- Website: feature block "Sizing and warehouse" with a screenshot and a seventh demo step; `/demo/` and the video
  show sizing a motor feeder, picking the part in stock and confirming.

### Demo video

- Demo video: `npm run record:demo` records the battery-charger story from the real built app (Playwright,
  1920 x 1080, visible pointer, zoom-ins, print preview) and encodes `site/video/demo.webm` and `demo.mp4`, a
  15 s muted hero loop, poster and step frames in `site/img/`, and captions in English and Italian
  (`demo.en.vtt`, `demo.it.vtt`). The landing page hero plays the loop; `/demo/` and `/it/demo/` are built from
  `docs/demo.md` and `scripts/site/demo.it.md`. `npm run check:site` fails when a file of the recording is missing.
- Input fields in the wire-class and wire-type tables are readable in the dark theme (they were white on white).

### M5 PLC

- Plan: added sizing and warehouse, and a CAD workspace with the AI inside (M6 parts 1 and 2); the cabinet layout is
  now M6 part 3 (`docs/brief.md`, `docs/roadmap.md`, product rule 12).
- PLC racks and I/O cards as devices: a card is a black box with a card type (CPU, digital or analog input or
  output), a rack and a slot; its pins are the channels. Cards come from generic library parts (CPU, DI 8 and 16,
  DO 8 and 16, AI 8, AO 4, a 4-slot rack) with their channel counts; place one from "PLC cards" in the symbol
  browser: it gets a designation, its part, a slot and its addresses in one undo step.
- Addressing scheme (project setting): Siemens notation (I0.0, Q0.1, IW64) or IEC 61131-3 (%IX0.0, %QX0.1, %IW32)
  and the first byte of each area; addresses are assigned per card and channel in rack and slot order (fill missing
  or reassign all), edited by hand, and rewritten when the style changes.
- "PLC I/O" window: every channel with address, tag, comment, what it is wired to and page-column, live from the
  schematic and editable (address, tag and comment here or on the card, every edit a command), plus the same list
  as a report page ("PLC I/O list", also in the XLSX workbook).
- Tag lists: export and import for CODESYS (global variable list, `name AT %IX0.0 : BOOL;`, checked against the
  CODESYS Online Help) and TIA Portal (PLC tag table XML in the Openness layout, marked unverified: Siemens'
  documentation was not reachable, see `docs/to-verify.md`). Import is previewed (tags matched to channels by
  address, nothing created) and applied as one undo step.
- The PLC-address-used-twice check now covers card channels and channel symbols, in any spelling of an address.
- Samples: the conveyor has a rack (CPU, 8 DI, 8 DO) with tagged I/O and a PLC I/O list page; the charger's PLC
  interface page uses DI and AI cards and has the list page too. All samples still open with no findings.
- File format 5 (migration from 4: `settings.plc`), JSON Schema updated.
- Demo video recorded again: cover sheet with the revision matrix, the check banner and one-click fix, the PLC I/O
  window and a tag export; the walkthrough in `docs/demo.md` and the Italian `scripts/site/demo.it.md` follow.
- Website: the PLC block shows a screenshot of the PLC I/O window.

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
