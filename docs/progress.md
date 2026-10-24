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

## M2 Devices and cross-references (done)

**What works**

- Devices with several representations (coil and contacts, single-line and multi-line symbols) linked by
  their designation, with main and auxiliary function counts; rename a device from any symbol, link one
  symbol to another device, renumber without breaking links. Properties panel: representations with their
  positions, parts (several per device), user fields, parent assembly, state note for coils.
- Cross-references in `page.column` or `page-column-row` format (Project settings), contact images under coils,
  references at contacts, interruption points with partner positions, joined nets across pages.
- Black boxes and connectors with numbered, named pins (place from the browser, edit pins in the panel); mated
  plug and socket pairs; boxes move with their wires. Nested assemblies (select devices, "Group as assembly").
  Macros: select, "Save as macro" (company library), place from the browser.
- 98 generic parts in the library (picker with search, custom parts typed in), project-level parts, BOM dialog
  (BOM button): columns and user fields, units to build, merge by part, CSV export.
- Samples rebuilt: conveyor and pump station (star-delta starters, timers, interlocks) in `page.column`; the
  110 V DC charger in Italian with the A-H, M-U / 0-9 frame, `08-E3` references, interruption points (L+, L-,
  IOUT), plug -X11 and socket -X10, black boxes (HMI, switch), the switching block -A5, a macro-placed alarm
  stage, and a BOM without missing parts.
- Tests: device linking, cross-reference formats and zones, contact images, interruption points and netGroups,
  connector pins and mates, nested assemblies, BOM (units, merge, CSV, incremental scans), macros, undo, part and
  macro validation, migration 1 to 2, sample checks (star-delta connectivity). One new end-to-end test.

**What is left**

- Deferred by design: connector pin lists and cable cores (M3), XLSX and PDF output of the BOM page and a BOM
  report page type (M3), nameplates (M3), the electrical rule check for coils without contacts, contacts used
  against contacts available, missing parts and duplicate designations (M4), cabinet layout from part dimensions
  (M6). The BOM columns cannot be reordered (only switched on and off).
- Boxes cannot be rotated or mirrored; macros reference library symbols by id only; the contact image can run
  into neighbouring objects when many contacts are used (move the coil or its neighbours).
- All parts are generic definitions marked `secondary` (docs/to-verify.md). When the sample PDFs were rendered with poppler here the text did not show (probably no fonts in that
  environment); please check an exported PDF in a normal viewer.

**What the owner must do by hand**

- Check the new rows of `docs/to-verify.md` (part rating classes, dimensions, symbol letters, terminal marks).
- Look at the three samples in the app (cross-reference text and contact images are drawn on the canvas) and
  say what should change before the website demo.


## M3 Wires and reports (done)

**What works**

- Wire numbering (Wires window, "Number wires" button, one undo step): by potential, by page and column or
  sequential, with a pattern such as `{n:3}{suffix}` (`020L+`, `005U`), start and step; nets joined across pages
  share a number; hand-typed numbers stay; numbers sit along the wire, rotated on vertical wires.
- Wire classes (company table editable in the Wires window), wire types, conductors drawn in their IEC 60757
  colour (option), a bundle label ("10 mm² BK"), cables with core colours, flat ribbon and RJ45 patch cables.
- Terminals: strip and number on placement, "Number terminals now"; terminal diagram with destination, wire,
  function, part and strip length; terminal parts count per terminal in the BOM.
- Reports window: terminal diagram, cable list, wire list, connector pin lists, BOM, contents, symbol legend,
  conductor colour and suffix tables, torque table (marked "to be verified"), nameplates, wire and terminal
  markers. Add them as pages (terminal, cable, BOM and "lists and tables" page types) and complete them when
  they grow. CSV per list, one XLSX with all lists, DXF export of a page and DXF import as plain graphics, the
  full PDF set. PDF text is now embedded (Roboto): it renders in poppler and every viewer (checked with
  pdffonts and pdftoppm).
- Samples: wire numbers, terminal strips (-X1), cables (motor cable on the conveyor, ribbon and patch cables on
  the charger) and report pages; the charger's input/rectifier and PLC pages re-spaced across the sheet, and it
  has the colour and suffix tables, legend, torque table and nameplates (generic content only).
- Tests: numbering schemes and patterns, wire classes and drawing, terminal and cable generation, every
  report, incremental recomputation (counts of page scans and nets), CSV, XLSX and DXF round trips, PDF font
  embedding, a 500-page numbering budget, file migration 2 to 3; three new end-to-end flows in one test
  (number wires, terminal diagram, XLSX and PDF set). `npm run screenshots` captures the website images.

**What is left**

- Terminal parts cannot differ per terminal; nameplate size and colour are fixed; DXF import ignores splines,
  hatches, blocks and layers; serif and mono styles still use the standard PDF fonts; the cabinet layout page is
  still a placeholder (M6); the ERC checks for cables and wire sizes are M4.
- The wire-class defaults, terminal widths and torques, and core colours are generic and listed in
  `docs/to-verify.md`; none is claimed as a fact.

**What the owner must do by hand**

- Check the new rows of `docs/to-verify.md` (IEC 60204-1 clause 13.2, terminal torques, core colours).
- Open the three samples and look at the numbered wires, the terminal and report pages, and an exported PDF in
  your normal viewer; say what should change before the demo recording.
- Set your company wire-class table (Wires window) before using the numbering on real work.


## M4 Checks and revisions (done)

**What works**

- Electrical rule check, continuous and incremental: duplicate designations, unconnected wire ends, coils without
  contacts and contacts without a coil, more contacts used than the parts provide, two potentials connected (on a
  page and across pages), conductor cross-section against the protective device for the stated installation method
  (assumptions printed, "does not replace the engineer's verification"), conductor colour against potential type
  (protective, green-and-yellow reserved, neutral), missing PE connection, more wires on a terminal than allowed,
  PLC address used twice. Each rule cites its standard in a comment and in the finding.
- Findings show as a marker on the page, in the message list (page link, rule, standard, assumptions) and in the
  warnings banner, with a one-click fix where the fix is a plain edit (rename a duplicate, remove a stray wire,
  resize or recolour conductors) and "Fix all that can be fixed" as one undo step. Installation method is a
  project setting.
- Revisions: issue status of the set, "Revisions" window to issue a revision (number, date, description, drawn,
  checked, approved) with a snapshot per page and an inventory of devices, wires and parts; pages changed since the
  last issue are marked in the page navigator and listed; comparison of two revisions (or the working copy) lists
  changed, added and removed pages, devices, wires and parts. The title block revision field follows (last
  revision that changed the sheet).
- Generated cover sheet: sheet index with revision matrix, revision list, issue status boxes, units to build,
  customer approval and signature block; contents page shows each sheet's revision.
- File format version 4 (migration from 3), JSON Schema updated.
- Samples open clean (a test asserts it) and each has revision 0 issued; the charger has revisions 0 and 1 with a
  changed battery page, like a real production set. Samples gained potential tags, PE feeds, PLC field terminals,
  sized conductors and auxiliary blocks to be correct under the new rules.
- Tests: every rule positive and negative, fixes and undo, fix-all, incremental page counts, revision change
  detection (also through save and reopen), comparison, cover sheet texts, migration 3 to 4, sample revisions, a
  500-page check and issue budget; two new end-to-end flows (banner and fix, issue and compare a revision).
  `npm run screenshots` captured the checks block and the new cover for the website.

**What is left**

- The cross-section table values are from secondary sources and flagged unverified (docs/to-verify.md); only
  conductors directly on a breaker or fuse are checked, between 1.5 and 35 mm². No voltage-drop or grouping
  correction. A per-motor PE check, rules for cable lengths and core counts, and ignoring or silencing a finding
  are not built. Revision snapshots store hashes, so the comparison says that a device or wire changed, not what
  inside it changed. The compare window has no page-by-page visual diff.
- Wire classes still decide colours and sizes for wires without their own type; the default class sizes are
  placeholders, so projects should set the company table.

**What the owner must do by hand**

- Check the new rows of `docs/to-verify.md`, above all the ampacity table against IEC 60364-5-52 Table B.52-5.
- Open the three samples: they should show no banner; change the installation method in Project settings to A1 to
  see the cross-section findings and their fixes. Look at the new cover sheet and at an exported PDF.

## M5 PLC (done)

**What works**

- PLC cards as devices: black boxes with a card type, rack and slot whose pins are the channels, from generic library
  parts with channel counts (CPU, DI 8/16, DO 8/16, AI 8, AO 4; a 4-slot rack part sits on the CPU device). Placing a
  card from the symbol browser gives a designation, the part, a slot and addresses in one undo step.
- Configurable addressing scheme (Siemens or IEC 61131-3 notation, first byte per area), assignment per card and
  channel (missing or all), manual edits, restyle when the scheme changes.
- "PLC I/O" window: every channel live from the schematic (address, tag, comment, connected to, page-column),
  editable, and the same list as a report page and a workbook sheet; the PLC address check covers cards.
- Tag lists: CODESYS global variable list and TIA Portal tag table XML, export and import; import previewed and
  undoable. CODESYS syntax checked against the CODESYS Online Help; the TIA format is marked unverified.
- Samples: conveyor with a CPU and 8-channel DI and DO cards, charger with DI and AI cards; both with tagged I/O
  and a PLC I/O list page; all three open with no findings. File format 5.
- Tests: addressing, assignment, overview and edits, report, tag-list round trips and import preview, the check,
  migration 4 to 5; an end-to-end flow (assign an address, export both formats, import with a preview, undo).
- Demo recorded again with the cover matrix, the check banner and fix, and the PLC window; `npm run screenshots`
  captured the PLC block of the landing page.

**What is left**

- The TIA Portal format is unverified (docs/to-verify.md); neither format has been tried in the vendor tool.
- A rack is a name plus slot numbers; there is no backplane drawing, slot limit or power budget. Analog scaling,
  channel data types beyond BOOL and WORD, symbol-table import that creates channels, and Excel formats are not built.
  Channel symbols (plc-input and plc-output, used by the pump station sample) still work and show in the overview,
  but have no tag or comment.
- Cards are placed from the symbol browser with their pins on the left; resizing pins is done in the properties panel.

**What the owner must do by hand**

- Try an exported tag list in TIA Portal and in CODESYS and tell us what they reject (the TIA file is the risky one).
- Check the default addressing start bytes against the controllers you use (docs/to-verify.md).
