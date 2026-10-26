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

## M6 part 1: Sizing and warehouse (done)

**What works**

- Load data on devices (Properties panel: motor nameplate or load current, starter, breaker curve, feeder length),
  supply data in Project settings (voltage, Ik, ambient, grouping, voltage-drop limit), wire lengths.
- Sizing engine (`shared/sizing.ts`, `shared/feeders.ts`): feeders are read from the schematic; breaker, contactors,
  overload relay, cable and wires are checked against their requirement (text, assumptions, unverified table values,
  "does not replace the engineer's verification"). Worked examples in `tests/sizing.test.ts`.
- Warehouse window: choose a CSV or XLSX file or a watched folder, map the columns (saved per company), refresh, edit
  the stock date, link items to library parts, "data missing" badges; sample stock list for the demo.
- Sizing window: review table for the whole project, suggestion panel per line (ranked, warehouse, location, quantity
  available for this project), accept a line or all as one undo step.
- BOM stock columns, shortage, old-stock and lost-part messages, picking-list export (CSV, XLSX).
- Samples: conveyor and pump station carry load data and ship sized; all three still open with no findings. The charger
  sample is unchanged except for the file format.
- Tests: sizing worked examples, availability arithmetic, import mapping, XLSX reading (a deflated workbook with shared
  strings), feeders and confirm commands, migration 5 to 6; an end-to-end flow (import stock, size a motor feeder,
  confirm, BOM quantities). The 500-page budget still passes.

**What is left**

- Every ambient and grouping factor, the voltage-drop constants and the generic breaking capacities are unverified
  (`docs/to-verify.md`); the results flag it. Method E has no grouping factors.
- Three-phase AC feeders only: no single-phase, DC, fuse-based or soft-starter/drive feeders; no motor starting current,
  discrimination or short-circuit withstand of the cable; star-delta contactors are all sized alike.
- A feeder fed from a shared bus without a breaker would walk into its neighbours' devices.
- Suggestions use library parts only (generic data); manufacturer data arrives through the company library. Cable
  lengths are typed by hand until the cabinet layout estimates them.
- Live ERP connections are not built (files and a watched folder only); stock rows of different warehouses are merged
  per part, with the largest free stock used first.

**What the owner must do by hand**

- Check the new rows of `docs/to-verify.md` against IEC 60364-5-52 (Tables B.52-14 and B.52-17, Annex G) and the
  generic breaking capacities; then set `CORRECTION_VERIFIED` and `VOLTAGE_DROP_VERIFIED` to true.
- Try your own ERP export in the warehouse window and tell us which column layouts or encodings fail.

## M6 part 3: Cabinet layout (done)

**What works**

- Layout pages drawn in real millimetres with the CAD workspace tools: enclosure and plate from the library (or drawn),
  DIN rails and wire ducts (two points, grips to resize, MOVE and typed coordinates), no-mount zones (hatched), covers,
  dimension lines, notes; devices placed from the BOM at their real size and snapped onto rails; ALIGN and DISTRIBUTE;
  the list of devices not yet placed; a door page with the door devices and the flexible-cable note; a generated side
  view with the device depths; outlines from the library, an imported DXF, SVG or image.
- A suggested layout as a preview (enclosure and plate with the spare-space percentage, rails, ducts, every device
  placed, ducts upsized under the fill limit), the rules it applied listed with their sources, accepted then edited;
  moved or locked items stay put when it is run again. The built-in assistant answers "suggest a layout", "move the PLC
  to the right and rearrange" and "explain the layout" as previews.
- Layout templates in the company library; layout exchange as documented JSON and CSV (`docs/layout-format.md`) and
  DXF of the 2D views, previewed and undoable, from a file or a watched folder; enclosure and device sizes from an ERP
  item master through the warehouse's column mapping.
- 3D view (three.js, lazy loaded), duct fill rate, wire lengths estimated along the ducts in the wire list and the
  cable metres of the BOM and warehouse (a typed length always wins), mounting-plate DXF for drilling, the layout pages
  in the PDF set at a standard scale.
- Samples: all three ship with a suggested layout (pump station: front and side; conveyor and charger: front, door and
  side); they still open with no check findings and no layout problems. File format 7.
- Tests: placement and rail snapping, align and distribute, suggestion rules and lock behaviour, templates, JSON, CSV and
  DXF round trips, item-master sizes, duct fill, wire lengths and cable metres, migration 6 to 7; an end-to-end flow
  (draw plate and rail, place a device, accept a suggestion, edit and suggest again, import a changed file, 3D, drilling DXF).

**What is left**

- Generic body sizes, hole patterns, wire diameters, scales and the company defaults are unverified (`docs/to-verify.md`);
  import the real sizes from your item master.
- One enclosure per project; rails and ducts are straight and axis-aligned; the suggestion never rotates devices,
  has no manufacturer clearances or heat rules, and no STEP export. Door devices are routed through the plate's ducts
  with the cabinet depth added. A live ERP connection is not built (files and a watched folder).
- The 3D view shows boxes only (no models, no labels on the boxes: the name shows on hover).

**What the owner must do by hand**

- Check the new rows of `docs/to-verify.md` and replace the generic part sizes with your own through the item master.
- Try the layout with your own enclosure and tell us which rules (clearances, heat, wire routes) your workshop needs.
- Try your ERP's item-master export in the layout window and tell us which column layouts fail.

## M6 part 2: CAD workspace with the AI inside (done)

**What works**

- Ribbon, command line (aliases, autocomplete, history, prompts, typed coordinates, repeat, cancel), status-bar drafting
  aids with object snap and dynamic input, window/crossing selection, grips, context menus, layers, dockable panels
  saved per user, full-screen canvas. Every ribbon button and dialog is also a command, and edits go through the command
  layer (undo).
- AI chat panel and the provider interface in `app/main/ai` with a deterministic built-in provider (contacts of a coil,
  wire numbering, feeder sizing with `shared/sizing.ts`); proposals preview on the canvas, claims carry their source,
  Accept is one undo step, and the panel says an API key is needed for free-form requests.
- Tests: command parsing, aliases and routing, typed input, snapping, ortho and polar, window/crossing, trim/extend/
  offset, grips, layers, panel layout, the built-in provider; end-to-end flows for command-line drawing with ortho, snaps,
  window versus crossing, layers, a layout surviving a restart, and a chat proposal accepted then undone.

**What is left**

- TRIM, EXTEND and OFFSET work on straight two-point lines (and rectangles and circles for OFFSET); ROTATE turns by
  multiples of 90 degrees about the selection centre; no hatching, arcs or splines; the wire tool keeps its own ortho
  routing (it does not take typed coordinates).
- Docking is by a dock selector in each panel header (left, right, bottom, hidden), not by dragging panels; panels in a
  dock share the height equally unless collapsed.
- Typed coordinates are page millimetres as the status bar shows them (y down); only angles run counter-clockwise.
- The real providers (Claude, OpenAI, Gemini), key storage and free-form requests are M7.

**What the owner must do by hand**

- Try the workspace with the habits of your CAD users and tell us which command, key or prompt is missing or behaves
  differently from what they expect.

## M7 AI assistant (done)

**What works**

- Claude, OpenAI and Gemini with the user's key (main process, `fetch`), keys in safeStorage, AI settings window, model
  ids as settings; the tool loop (read project/page/devices/wires, run checks, size feeder/cable with stock, find parts,
  propose starter, renumbering, sizing, layout, plain commands); size-bounded context with check results; previews with
  Accept / Reject, one undo step; sources on every claim, electrical values as suggestions with assumptions; refusals,
  limits, cancel and plain-language errors; the built-in assistant without a key.
- Tests: scripted conversations through the tool loop (starter, renumbering, "why does the check say", refusals,
  cancel, limits, undo), provider mapping from recorded fixtures, key storage, end-to-end settings/chat/command line.

**What is left**

- Only the star-delta starter exists as a library macro (a direct-on-line or other starter needs `propose_commands`
  or a new macro). Hypothetical sizing (no device in the project) is `size_cable` and `find_parts`; the feeder engine
  sizes devices that have load data. Prompt wording and tool descriptions are tuned from fixtures, not from a real model:
  expect to adjust them once a real key has been tried. Model ids of OpenAI and Gemini follow MechPilot and are
  unverified against the live APIs.
- No streaming of the answer text (tool steps are shown while it works). Proposals are not replayed in later turns.

**What the owner must do by hand**

- Try it with a real key: open **AI settings** (chat panel or `AISETTINGS`), pick the provider, paste the key, **Test
  key**, then ask "add a star-delta starter for a 7.5 kW motor on page 5". Tell us where the answers or the proposals
  are wrong; the model ids may need updating.
- Run the skipped real-key tests: put `ANTHROPIC_API_KEY=...`, `OPENAI_API_KEY=...` and/or `GEMINI_API_KEY=...` in the
  environment or in `.env.local` at the repository root (git-ignored), then `npx vitest run tests/ai-real.test.ts`. Each
  runs one short request with the fast model; without a key it is skipped. In development (`npm run dev`) the same
  variables act as a fallback key.

## M8 part 1: ERP link (done)

The owner asked (2026-10-26) for a two-way ERP link and for the features of Siemens Capital Electra X (now Capital X
Panel Designer) before release 1. Both are now parts of M8 in the roadmap. This is the first part.

**What works**

- Pulling items and stock over HTTP (REST or OData v4 with paging) into the warehouse through the column mapping;
  automatic pull; ERP settings with encrypted credentials and Test connection; picking a stock item for a device as
  one undo step; the reservation request previewed and sent by HTTP POST or to an outbox folder, then the stock
  pulled again; a demo ERP on 127.0.0.1 for demos and tests. The format is in `docs/erp-link.md`.
- Tests: unit tests of the pure part and of the main-process service (fake fetch), a round trip against the demo
  ERP, and an end-to-end test of the whole flow in the built app.

**What is left**

- One generic HTTP connector. There are no product-specific connectors (Odoo JSON-RPC, SAP Business One Service
  Layer) and no direct SQL access. Add them if companies ask.
- The ERP does not push changes; CablePilot pulls (on demand or every 5 minutes or more).
- One saved column mapping per company: switching between a stock file and the ERP asks for the mapping again.
- The item-master sizes for the cabinet layout still come from a CSV or XLSX file, not from the live pull.

**What the owner must do by hand**

- Try it against your own ERP: **Reports → ERP link**, write the items address, choose the sign-in, **Test
  connection**, then **Pull stock now**. Tell us which ERP it is and what failed. The "Common ERPs" section of
  `docs/erp-link.md` lists starting points that have not been tested against a live system.
- Decide whether reservations should go by HTTP or through an outbox folder, and who writes the small adapter on the
  ERP side that turns the request into a reservation.

## M8 part 2: Panel designer features (done)

**What works**

- A symbol placed on a wire cuts it between its pins (renumbered in the same step when the wire was numbered
  automatically). Auto-wire connects selected symbols in sequence, pole by pole. Ladder pages have rails, numbered
  rungs, line-number cross-references and the `rung` wire-numbering scheme. Project history keeps daily backups
  and named versions, with compare and restore (one undo step).
- Tests: unit tests for each piece (`tests/panel.test.ts`) and an end-to-end test of all four (`e2e/panel.e2e.ts`).

**What is left**

- Only placing from the library cuts wires. Moving an existing symbol onto a wire does not, and neither do paste,
  macros, imports or the assistant.
- Auto-wire follows pin directions. A symbol rotated so that no pin faces the next one is skipped, and it does not
  route around other symbols.
- Ladder pages: the rails are ordinary wires (change their potential in the properties), and the contact image under a
  coil lists line numbers but does not use the NFPA right-margin listing with underlined NC contacts. The line
  numbers do not move when pages are reordered: switch the page back with `LADDER OFF` and then `LADDER` to renumber.
- History files stay in the app's data folder of this computer; they do not travel with the project file.

**What the owner must do by hand**

- Check the ladder conventions (page × 100 line numbers, 10 mm rungs, `205A` wire numbers) against what your North
  American customers expect. They are listed in `docs/to-verify.md`.


## Design polish and short videos (done)

**What works**

- A design pass over the whole window:
  - top bar with grouped icon buttons
  - a calm warnings banner, with correct plurals
  - tidy findings with page chips and soft fix buttons
  - quieter panel headers
  - clamped symbol names
  - a three-line command history
  - a tidier status bar (its hint still shows in full)
  - info-style AI notice, real-looking links, readable tables
  - dialogs with a shadow and a short fade-in
  - thin scrollbars and hairline splitters

  It covers the dark and light themes. A layout bug where the window could grow wider than the screen is fixed.
  The website screenshots were taken again.
- Short videos for the website, like BoardPilot's: one clip per feature area in English and Italian, recorded from
  the real app on the sample projects. The captions are drawn into the picture. Run `npm run record:clips` to record
  them again after any visible change.

**What is left**

- The clips do not show the M8 part 2 features (ladder pages, auto-wire, project history) yet. Add a clip for them in
  `e2e/clips.json` when those screens are final.

**What the owner must do by hand**

- Watch the clips on the landing page in both languages and tell us which caption or step should change. Each clip
  is data in `e2e/clips.json` plus one script in `e2e/clips.e2e.ts`.

## Demo video with the new design (done)

- The full demo, its captions, step frames and the hero loop are recorded again with the new design. The captions now
  line up with the action. A magenta sync frame at the start of each recording anchors the timing
  (`scripts/video-sync.mjs`). Before, the end of the file was the anchor, and it drifted by the seconds Playwright
  took to finish writing. The short clips use the same anchor and were recorded again.
- The demo WebM is encoded a little harder (CRF 38) to stay under the 8 MB budget now that it runs 141 s.

## M8 part 3: release preparation (done, except the first tagged build)

- Release builds are configured (electron-builder, `npm run dist`) and a release workflow runs on `v*` tags.
- CI runs the end-to-end tests on Linux with software WebGL. This fix is not proven yet: it needs a push.
- Docs: getting started, numbering and the file format, also as pages on the website in both languages.
- The website and the README follow BoardPilot's design, with structured data and social cards for search engines.
- End-to-end tests cover every main workflow: 33 pass. The recordings (demo, clips, screenshots) run on demand.
- Launch check done: the charger sample prints as 27 sheets, and each row of `docs/reference-drawing-check.md` has
  its evidence. Two things are drawn differently from the reference set: the board legend is the black boxes plus
  the pin lists, and there is no combined fuse switch-disconnector symbol (a company can draw one in the symbol
  editor).

**What is left**

- "Release builds from a git tag": tick it after the first tag run produces the four installers. Ticking it marks
  M8 done, and the website then shows direct download buttons.
- The short videos and the demo were recorded before the charger sample gained its new sheets. Record them again
  (`npm run record:clips`, `npm run record:demo`) when convenient.
- Electron prints a deprecation warning about `safeStorage` at start-up; it does not affect the app yet.

**What the owner must do by hand**

- Push `main` and check that CI passes on Linux.
- Push a tag (for example `v0.1.0`) when ready for the first release, and check the installers on each system.
- On GitHub, under the repository's About: the description, the website `https://cablepilot.agentflowbind.com`,
  topics (electrical-cad, iec-60617, control-panel, schematic, electron), and under Settings the social preview
  image `site/img/og.png`.

## Licence change (done)

- CablePilot is source-available under the CablePilot License 1.0, like BoardPilot: a 30-day free trial on each
  computer, then a licence key. The app shows the trial in the top bar, takes a key in the Licence dialog and asks
  for one when the trial has ended. Keys are Ed25519-signed and checked offline (`app/main/license/`).
- `library/` data is CC BY 4.0. Versions up to `01271c2` stay Apache-2.0.
- The website has a pricing section; the README, FAQ and contributor guide describe the new licence.

**What the owner must do by hand**

- Back up `~/.cablepilot/license-private.pem` somewhere safe (a password manager or an encrypted drive). It signs
  every licence key; if it is lost, no new key can be issued that the released app accepts.
- Issue a key: `node scripts/make-license.mjs --name "Customer name" --plan commercial --seats 3`.
- Decide prices and how people pay. Until then the website says "Coming soon" and requests go through GitHub
  Discussions.
- The demo video and the short clips were recorded before the trial chip existed; they still show the old top bar.

