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

- [ ] A device is one or more symbols (coil and contacts, multi-pole breakers), with main and auxiliary functions
- [ ] One device, several representations (single-line and multi-line), counted once in the BOM and cross-referenced both ways
- [ ] Contact images under coils, with an optional note on the shown state
- [ ] Cross-references with a configurable format: page.column, or page-column-row like `08-E3`
- [ ] Interruption points between pages, carrying a signal or potential name
- [ ] Black boxes, connectors and plugs with numbered, named pins
- [ ] Nested assemblies (a device on or inside another), dashed outline, grouped in the BOM
- [ ] Macros: groups of symbols, black boxes and wires saved to the company library and placed again
- [ ] Parts assigned from the library; several parts per device; project-level parts with no designation
- [ ] BOM with configurable columns and user fields; quantity multiplied by the number of units to build
- [ ] Generic device library including DC and power-electronics parts (rule 9)

## M3 Wires and reports

- [ ] Automatic wire numbering (potential-based, page-column or sequential) with a configurable pattern and suffixes
- [ ] Wire types and a company wire-class table (function, colour, cross-section, type, suffix); conductors drawn in their colour; one label for a bundle of wires
- [ ] Terminals and terminal strips generated from the schematic
- [ ] Cables with cores and core colours, flat ribbon cables, patch cables (RJ45) between connectors
- [ ] Live reports: terminal diagrams, cable list, wire list, connector pin lists, BOM, contents
- [ ] Generated pages: symbol legend, conductor colour and wire-suffix tables, tightening-torque table (from library data, with sources)
- [ ] Nameplates: label text per device, drawn on a page and exported as a list
- [ ] Exports: PDF drawing set, CSV and XLSX, wire-marker, terminal-marker and nameplate lists
- [ ] DXF import and export of pages

## M4 Checks and revisions

- [ ] Electrical rule check (rule 5) with the warnings banner and one-click fixes
- [ ] Issue status of the set: for proposal, for approval, for construction, as built
- [ ] Issue a revision (number, date, description, drawn / checked / approved); the app works out which pages changed
- [ ] Generated cover sheet: sheet index with the revision of every sheet, revision list, issue status, customer approval and signature block
- [ ] Compare two revisions: changed pages highlighted, list of added, removed and changed devices, wires and parts

## M5 PLC

- [ ] PLC racks and I/O cards as devices
- [ ] I/O assignment overview
- [ ] Tag lists exported and imported in the formats TIA Portal and CODESYS accept, each verified against the vendor documentation and cited in code

## M6 Cabinet layout

- [ ] Enclosure and mounting plate from the library, DIN rails and wire ducts
- [ ] Devices placed from the BOM at real size in a 2D front view to scale; outlines from the library or an imported DXF, SVG or image
- [ ] Side view showing device depths
- [ ] Dimension lines, notes, hatched no-mount zones, covers, door-mounted devices
- [ ] 3D view of the cabinet
- [ ] Duct fill rate
- [ ] Wire lengths estimated along the ducts
- [ ] Mounting-plate DXF for drilling
- [ ] The layout in the PDF set

## M7-AI Assistant

- [ ] Providers: Claude, OpenAI or Gemini with the user's key, called only from the main process
- [ ] It sees the project, the current page, the selection and the check results
- [ ] Tools to read the project, find devices, run the checks and propose commands
- [ ] Each proposal shows as a highlighted preview with Accept / Reject and goes into undo
- [ ] Tested against a fake provider in CI; a real-key test is written but skipped until a key is set

## M8 Release 1 (end of phase 1)

- [ ] Release builds from a git tag: macOS dmg (arm64 and x64), Windows installer, Linux AppImage (unsigned at first, ready for signing)
- [ ] The website with screenshots from the real app and the recorded demo
- [ ] Docs: getting started, the project file format, how numbering works
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
