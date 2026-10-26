# Roadmap

Milestones from `docs/brief.md`, as checklists. Every milestone ends the same way: the app runs with
`npm run dev`, the tests pass, the sample projects work, there is a `CHANGELOG.md` entry, one commit,
and a short entry in `docs/progress.md`. The website reads the ticked boxes here
(`scripts/build-site.mjs`): keep the heading format `## M<n> <title>`.

## M0 Scaffold

- [x] Repo: CLAUDE.md, this roadmap, `docs/decisions.md`, `docs/progress.md`, `docs/to-verify.md`
- [x] Licence files: Apache-2.0 `LICENSE`, `NOTICE`, `THIRD_PARTY_LICENSES.md` generated at build
- [x] Open source: CONTRIBUTING (DCO sign-off), CODE_OF_CONDUCT, SECURITY.md, issue and PR templates, "contribute in 30 minutes" in the README
- [x] CI: typecheck, unit tests, licence check (fails on GPL/AGPL), library check, build, site build
- [x] App skeleton: Electron main, typed preload, renderer with contextIsolation on and nodeIntegration off
- [x] Main layout: top bar, page navigator, canvas, properties panel, symbol and device browser, message list
- [x] i18n: `t()` with English and Italian, enforced by a test
- [x] Website skeleton: landing page, "For companies", 404, sitemap, robots, headers, redirects, in English and Italian

## M1 Schematic editor

- [x] Project with pages of different types: cover, contents, power, control, PLC, terminals, cables, layout
- [x] Single-line (overview) pages with n-conductor tick marks, next to the multi-line pages
- [x] Project data pages: forms (text fields, tick boxes, tables) filled from project and assembly properties (IEC 61439 data)
- [x] Page frames with column and row zones, configurable zone labels (e.g. skip I and O), sheet sizes A4 to A0 (ISO 5457)
- [x] Company templates stored in the project and reusable: frame, title block (logo, drawing number, order number, client, product, sheet title, drawn / checked / approved, issue date, sheet / next sheet / total, revision), margin text
- [x] Drawing styles: colours per element type, line weights, fonts; print preview always on white
- [x] Drawing language as a project setting, separate from the UI language; device and function texts in English and Italian
- [x] IEC 60617 symbol library as data: graphics, connection points, function type
- [x] In-app symbol editor, saving to a company library checked by the same validation script
- [x] Place, move, rotate and mirror
- [x] Orthogonal wires with auto-connect and junctions
- [x] Potentials (L1/L2/L3/N/PE, L+/L-, 24 V DC, 0 V, 110 V DC)
- [x] IEC 81346 designations with automatic numbering, including location (+DS, +MO...)
- [x] Free annotation: text (rotated, multi-line), lines, rectangles, dashed outlines, tables, images (PNG, JPEG, SVG), warning-sign graphics
- [x] Undo, save, PDF export of pages

## M2 Devices and cross-references

- [x] A device is one or more symbols (coil and contacts, multi-pole breakers), with main and auxiliary functions
- [x] One device, several representations (single-line and multi-line), counted once in the BOM and cross-referenced both ways
- [x] Contact images under coils, with an optional note on the shown state
- [x] Cross-references with a configurable format: page.column, or page-column-row like `08-E3`
- [x] Interruption points between pages, carrying a signal or potential name
- [x] Black boxes, connectors and plugs with numbered, named pins
- [x] Nested assemblies (a device on or inside another), dashed outline, grouped in the BOM
- [x] Macros: groups of symbols, black boxes and wires saved to the company library and placed again
- [x] Parts assigned from the library; several parts per device; project-level parts with no designation
- [x] BOM with configurable columns and user fields; quantity multiplied by the number of units to build
- [x] Generic device library including DC and power-electronics parts (rule 9)

## M3 Wires and reports

- [x] Automatic wire numbering (potential-based, page-column or sequential) with a configurable pattern and suffixes
- [x] Wire types and a company wire-class table (function, colour, cross-section, type, suffix); conductors drawn in their colour; one label for a bundle of wires
- [x] Terminals and terminal strips generated from the schematic
- [x] Cables with cores and core colours, flat ribbon cables, patch cables (RJ45) between connectors
- [x] Live reports: terminal diagrams, cable list, wire list, connector pin lists, BOM, contents
- [x] Generated pages: symbol legend, conductor colour and wire-suffix tables, tightening-torque table (from library data, with sources)
- [x] Nameplates: label text per device, drawn on a page and exported as a list
- [x] Exports: PDF drawing set, CSV and XLSX, wire-marker, terminal-marker and nameplate lists
- [x] DXF import and export of pages

## M4 Checks and revisions

- [x] Electrical rule check (rule 5) with the warnings banner and one-click fixes
- [x] Issue status of the set: for proposal, for approval, for construction, as built
- [x] Issue a revision (number, date, description, drawn / checked / approved); the app works out which pages changed
- [x] Generated cover sheet: sheet index with the revision of every sheet, revision list, issue status, customer approval and signature block
- [x] Compare two revisions: changed pages highlighted, list of added, removed and changed devices, wires and parts

## M5 PLC

- [x] PLC racks and I/O cards as devices
- [x] I/O assignment overview
- [x] Tag lists exported and imported in the formats TIA Portal and CODESYS accept, each verified against the vendor documentation and cited in code (CODESYS checked against its Online Help; the TIA Portal XML could not be checked against Siemens' documentation and ships marked unverified)

## M6-Sizing and warehouse (part 1 of M6, brief rule 12)

- [x] Load and feeder data on devices; project supply data (voltage, prospective short-circuit current, ambient temperature, installation method, grouping); cable lengths
- [x] Sizing engine in `/shared`: cable current-carrying capacity and correction factors (IEC 60364-5-52), protection coordination Ib ≤ In ≤ Iz and I2 ≤ 1.45 Iz (IEC 60364-4-43), voltage drop, breakers (IEC 60947-2), contactors and overload relays (IEC 60947-4-1), with sources and stated assumptions
- [x] Warehouse stock import from CSV/XLSX with a saved column mapping and refresh; stock items linked to library parts; "data missing" for items without technical data; generic sample stock file
- [x] Suggestions per device and per conductor: only parts that meet the requirement, ranked by availability, showing warehouse, location and the quantity available for this project; select and confirm as one undoable command
- [x] "Size the whole project" review table, accept line by line or all
- [x] Quantities: available = on hand − reserved − this project's use (× units to build, cable in metres); BOM columns on hand / available / short / location; shortages and stale stock flagged in the message list; picking-list export
- [x] Tests (sizing worked examples, availability arithmetic, import mapping) and e2e (import stock, size a motor feeder, confirm, BOM quantities)

## M6-CAD workspace with the AI inside (part 2 of M6)

- [x] AutoCAD arrangement and behaviour as closely as the law allows (ribbon on top, command line and status bar at the bottom, palettes at the sides, crosshair cursor, same commands, keys and prompts); only Autodesk logos, icon artwork, names and trademarks excluded
- [x] Ribbon with tabbed, grouped tools (Home, Insert, Wires, Reports, PLC, Layout, View)
- [x] Command line with history, autocomplete, the usual CAD aliases (L, PL, REC, C, M, CO, RO, MI, E, TR, EX, O, Z/ZE, U, PAN, LA, DI) and our commands; Enter/Space repeats, Esc cancels
- [x] Status-bar drafting aids: grid F7, ortho F8, snap F9, object snap F3 with modes, polar tracking F10; dynamic input with typed lengths, angles and relative coordinates
- [x] CAD selection: window and crossing, Shift to remove, grips, right-click menus with repeat
- [x] Layers (on/off, lock, colour, line type) mapped to the drawing styles
- [x] Dockable, resizable panels (pages, symbols, properties, layers, messages, AI chat); layout saved per user; full-screen canvas
- [x] AI chat panel docked by the canvas (project, page and selection as context); natural-language input on the command line goes to the assistant; context hints; works with the fake provider until M7
- [x] Tests: command-line drawing, snaps, window/crossing, saved panel layout, a chat proposal accepted and undone

## M6 Cabinet layout

- [x] Enclosure and mounting plate from the library, DIN rails and wire ducts
- [x] Drawn by the user with the CAD workspace tools (snaps, typed coordinates, grips, layers)
- [x] Devices placed from the BOM at real size in a 2D front view to scale; outlines from the library or an imported DXF, SVG or image; snap to rails, align, distribute; list of devices not yet placed
- [x] Suggested layout (enclosure and plate size with spare space, rails, ducts, every device placed by function and schematic order, terminals by the cable entry, door devices, clearances, duct fill) as a preview; the user edits it freely; moved or locked items stay put when re-suggesting; the rules applied are listed
- [x] Layout templates saved to the company library and loaded into new projects
- [x] Layout exchange with an ERP or another system: documented, versioned JSON and CSV (designation, part code, enclosure/plate/door, rail, x, y, z, rotation, size) and DXF; import previewed and undoable; enclosure and device dimensions from the ERP item master via the CSV/XLSX mapping; files or a watched folder (live ERP connection decided with the owner)
- [x] Side view showing device depths
- [x] Dimension lines, notes, hatched no-mount zones, covers, door-mounted devices
- [x] 3D view of the cabinet
- [x] Duct fill rate
- [x] Wire lengths estimated along the ducts
- [x] Mounting-plate DXF for drilling
- [x] The layout in the PDF set

## M7-AI Assistant

- [x] Providers: Claude, OpenAI or Gemini with the user's key, called only from the main process
- [x] It sees the project, the current page, the selection and the check results
- [x] Tools to read the project, find devices, run the checks and propose commands
- [x] Each proposal shows as a highlighted preview with Accept / Reject and goes into undo
- [x] Tested against a fake provider in CI; a real-key test is written but skipped until a key is set

## M8-ERP link (part 1 of M8, asked by the owner on 2026-10-26)

- [x] Live link to the company's ERP over HTTP (REST or OData v4 JSON, with paging): items and stock pulled into the warehouse through the same column mapping as a stock file, refreshed on demand or every few minutes
- [x] Connection settings (items URL, rows path, next-page path, authentication: none, basic, bearer token or API-key header); the password or token encrypted with safeStorage and never shown to the renderer; Test connection
- [x] Pick from the warehouse: search the stock and assign an item to the selected device in one undoable step (its library part when linked, otherwise the ERP item marked "data missing")
- [x] Send back to the ERP: the project's reservation request (documented, versioned JSON and CSV: part code, quantity × units to build, unit, devices, warehouse, location) previewed first, then sent by HTTP POST or written to an outbox folder; stock refreshed afterwards
- [x] A demo ERP inside the app (local only, generic sample stock) so the two-way flow can be shown without a real ERP (rule 10)
- [x] Docs (`docs/erp-link.md`), tests (mapping of JSON records, paging, authentication headers, secrets kept out of errors, reservation arithmetic, outbox files) and an end-to-end test against the demo ERP

## M8-Panel designer features (part 2 of M8, parity with Capital X Panel Designer)

- [x] Insert a symbol onto an existing wire: the wire is split at the symbol's connection points and the wire numbers follow
- [x] Auto-wire: connect the selected symbols in sequence with one command
- [x] Ladder pages (NFPA 79 option): numbered rungs, line-reference cross-references and wire numbers by rung
- [x] Project history: automatic daily backups and named versions, compared and rolled back as one undoable step

## M8 Release 1 (end of phase 1)

- [ ] Release builds from a git tag: macOS dmg (arm64 and x64), Windows installer, Linux AppImage (unsigned at first, ready for signing)
- [x] The website with screenshots from the real app and the recorded demo
- [x] Docs: getting started, the project file format, how numbering works
- [ ] End-to-end tests of every main workflow
- [ ] Launch checklist: the DC battery-charger sample printed as a full drawing set, every row of `docs/reference-drawing-check.md` ticked

## M9 and later: phase 2, electronics

- [ ] Electronic schematic capture with IEC and ANSI symbols, nets and an electronics ERC
- [ ] KiCad schematic, symbol and footprint import and export (formats only, never KiCad code)
- [ ] A 3D board from the footprints
- [ ] BOM
- [ ] Decide on PCB layout together with the owner after M9

## After release 1: to decide with the owner

- [ ] Importing an existing drawing set (PDF or DXF from another tool) as an editable, connected project, e.g. with AI proposing the result as a preview (until then a DXF page imports as plain graphics)
