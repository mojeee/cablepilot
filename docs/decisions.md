# Decisions

Choices made along the way, with the reasons. Where the brief left a choice between reasonable
options, the conservative one was taken. Newest at the bottom of each section.

## Decided in the brief (not to be asked again)

Name CablePilot; Apache-2.0; copyright holder Mojtaba Amini; no published email address; website
https://cablepilot.agentflowbind.com on Cloudflare Pages; AI models `claude-sonnet-5-5` and
`claude-haiku-4-5-20251001` with OpenAI and Gemini through `fetch`; dark UI with a light theme;
IEC 60617 symbols by default with NFPA 79 / ANSI as an option from M1; three sample projects.

## M0

- **Same stack and layout as MechPilot** (Electron + electron-vite, TypeScript strict, React,
  Zustand, plain CSS tokens, Vitest, Playwright), so conventions carry over. Version ranges are the
  ones MechPilot builds with. `.npmrc` has `legacy-peer-deps=true` for the same reason.
- **Two TypeScript projects, not three.** `tsconfig.node.json` (main, preload, shared, tests, e2e)
  and `tsconfig.web.json` (renderer, shared). MechPilot's workers project is not needed: CablePilot
  has no WebAssembly solver or CAD kernel. A worker project is added if M6 or later needs one.
- **No `electron-builder` yet.** Packaging arrives with M8; adding it now would add many transitive
  dependencies to the licence check for nothing. M8 will add it and record it here.
- **No three.js, pdf-lib or AI SDK yet.** Each is added by the milestone that needs it (M6 3D view,
  M1 PDF export, M7 assistant) and recorded here with its licence.
- **Settings in a JSON file** in the app's data folder, validated on read (`shared/settings.ts`),
  so a damaged file never breaks the app. No secrets in it; API keys use `safeStorage` from M7.
- **`CP_PROFILE`** environment variable sets the app's data folder, so end-to-end tests start clean
  (MechPilot uses `MP_PROFILE`).
- **Sandbox on for the renderer** (`sandbox: true`, with contextIsolation on and nodeIntegration
  off), as in MechPilot. The preload is therefore bundled as a single CommonJS file.
- **Sheet sizes and frame margins are placeholders until verified.** The A4 to A0 sizes are the ISO
  216 A series; the frame margins on the M0 canvas are placeholders. Both are listed in
  `docs/to-verify.md`; frame templates with verified values come with M1.
- **IEC 60757 colour codes shipped as `secondary` verification** (two-letter codes widely published;
  the standard's text has not been seen) and listed in `docs/to-verify.md`. They exist in M0 to
  exercise the library check; nothing computes from them yet.
- **Website built by our own script** in the shape of MechPilot's (`scripts/build-site.mjs`,
  `scripts/check-site.mjs`, `scripts/site/`), but leaner: texts live in `scripts/site/texts.mjs`
  (English and Italian side by side, `{{t:key}}` tokens in templates) instead of a separate Italian
  dictionary, no markdown renderer until the docs pages arrive (M8), no standards pages until the
  library has tables worth showing. `docs/website.md` says what is still to come.
- **Site CSP is stricter than MechPilot's**: `script-src 'none'` and `style-src 'self'` (no inline
  styles), plus `object-src`, `base-uri`, `form-action` and `frame-ancestors`. `media-src 'self'`
  for the demo video. The Open Graph image is an SVG placeholder (`og.svg`) until a real screenshot
  exists (M8).
- **Comparison table shows CablePilot only.** The brief wants an honest comparison with no claim we
  cannot back. Until each claim about another tool is verified against its vendor's documentation,
  the table lists capabilities and CablePilot's own status; columns for other tools come later.
- **The licence check** (`scripts/check-licenses.mjs`, copied in approach from MechPilot) walks
  `node_modules`, fails on GPL or AGPL (dual "MIT OR GPL" accepted: we take the MIT side) and on
  LGPL packages not listed in `scripts/lgpl-allowlist.json` (empty). `npm run build` writes
  `THIRD_PARTY_LICENSES.md` (git-ignored); CI uploads it as an artifact.
- **The e2e smoke test runs in CI under xvfb**, like MechPilot's, in a separate job after the unit
  job. If it proves flaky on the runner it can be made non-blocking.
- **`dev` has no sample project yet**: the navigator shows eight placeholder pages (one per page
  type of M1) so the layout can be seen and tested.

## M1

- **pdf-lib for the PDF export** (MIT, pure JavaScript; brings pako, @pdf-lib/standard-fonts, @pdf-lib/upng,
  tslib, all MIT or Apache-2.0). Content streams are written as plain PDF operators in millimetres under a
  scale-and-flip matrix, so 1 mm on the sheet is 1 mm in the PDF (72 / 25.4 pt per mm, not rounded), with
  fixed font resource names (deterministic output in tests). Standard fonts, not embedded; text outside
  WinAnsi becomes `?` (a few substitutions). Content streams are not compressed yet (size, not
  correctness). The export runs in the renderer because SVG images need a canvas to be rasterised.
- **ajv (MIT) as a dev dependency**, only to check files against `shared/schema/project.schema.json` in tests.
- **One drawing-primitive vocabulary** (`shared/draw/primitives.ts`): the page builder turns elements,
  symbols and sheet furniture into polylines, circles, arcs, text and images once; the Canvas 2D renderer,
  the PDF writer and the tests all use them, so screen and paper agree.
- **History keeps snapshots, not inverse commands.** Commands are plain data applied by `apply(project,
  command)`; the project is immutable with structural sharing, so an undo entry is the previous project
  (cheap even for 500 pages). A test applies, undoes and redoes every command type.
- **Project file format v1**: stable key order (identity keys first, rest alphabetical, fixed top level),
  short arrays and points on one line, elements in drawing order. A hand-written validator reports damaged
  files in plain language; a JSON Schema describes the format for other tools. Version 1 is the first
  released format, so `MIGRATIONS` is empty and the migration runner is tested with injected migrations.
- **Company symbols are embedded in the project** that uses them, so a project opens on any machine; the
  company library itself is a folder of data files in the app's data folder (`company-library/symbols`,
  `templates`). Templates are stored in the project and can be saved to and loaded from the company library.
- **Library validation rules live in `scripts/library-validate.mjs`**, shared by `check-library`, the tests
  and the app (the main process validates a company symbol before writing it).
- **Symbols are drawn by us** on a 2.5 mm grid with pins on the grid. Standard parts and letters are cited
  at part level and marked `secondary` (docs/to-verify.md); nothing claims a symbol number we have not seen.
  NFPA 79 / ANSI alternative graphics exist for ten symbols; the others show the IEC graphics under NFPA.
- **Designations**: the product part (`-K1`) is stored on the element; function (`=`) and location (`+`)
  default from the page. Auto-numbering takes the smallest free number per function, location and letter
  code. Contacts do not number automatically (they take their coil's designation, by hand in M1; devices
  with several symbols arrive in M2, so the samples repeat a designation on purpose).
- **Connectivity**: wires join where an end meets another wire, at a junction, or at a pin lying on the wire;
  crossings do not connect. Nets are per page in M1 (interruption points join pages in M2). Two different
  potentials in one net set `conflict` (reported by the checker in M4).
- **Wires keep their segments orthogonal**: moving, rotating or mirroring symbols drags attached wire ends
  and inserts a corner; junction dots are added when three branches meet and removed when they no longer do.
- **Zone labels are plain lists** in the template (any scheme works); the UI generates them from a range
  with letters to skip. Frame margins, the 180 x 36 mm title block and the zone band are placeholders until
  ISO 5457 and ISO 7200 are checked (docs/to-verify.md).
- **Drawing language** is `settings.drawingLanguage`; text printed on paper comes from
  `shared/drawingText.ts` and from per-language texts stored in the project (`LText`), never from `t()`.
- **Dark canvas** lightens near-black and grey drawing colours only; the print preview and the PDF always
  use the style colours on white.
- **Samples are generated** from `tests/support/samples.ts` by the same commands the app uses; a test fails
  if the committed JSON is stale. The main process reads them from `<app path>/samples` (packaging in M8).
- **Autosave** writes a recovery copy 4 s after the last change and on window hide; saving clears it; the next
  start offers to recover. `CP_E2E_DIR` makes Save and Export PDF write into a folder without dialogs, for
  the end-to-end tests only.
- **Performance budget test** (`tests/perf.test.ts`): a 500-page, 50,000-element project serialises and parses
  within 8 s, a 200-object page renders within 250 ms, nets of a page within 250 ms.
- **Not done in M1 (by design)**: terminal, cable and layout pages are page types only (content from M3 and
  M6); the star-delta starter of the pump sample needs M2 devices; a PDF page title block cannot yet be
  moved cell by cell in the UI (cells are data in the template).

## M2

- **A device is identified by its full designation, not by an id.** Every symbol, box and assembly outline
  carrying the same `=function+location-product` is one device. This is how EPLAN-style tools behave and
  keeps the file simple (no device table to keep in step with the drawing). Device data that is not drawn
  (parts, user fields, parent assembly) lives in `project.devices`, keyed by the full designation; renaming a
  symbol renames the whole device and moves its record (command `el/update`), `device/relink` changes one
  symbol only, renumbering keeps representations together.
- **File format version 2** (`devices`, `parts`, `projectParts`, `settings.crossRef`, `settings.bom`), with a
  migration from 1. Parts used by a project are embedded as copies (like company symbols), so a project opens
  anywhere without the library.
- **Cross-reference text** is `page.column` (default) or `page-column-row` with the page number padded to a
  configurable number of digits; the column and row labels come from the template, so a company that labels
  columns with letters and rows with digits gets `08-E3`. The page number is the page's position in the set.
- **Contact image** is drawn at the coil's label side, one row per contact or power part with a small glyph
  (make, break, main) and its position; the state note is a free text (`stateNote`) on the coil.
- **Interruption points are symbols** (`interruption-point`, value = signal name), so placing, snapping and
  connectivity reuse the symbol path. A signal named like a project potential also carries that potential.
- **Black boxes and connectors are one element kind (`box`)** with pins on its border; pins are numbered and
  named, spaced 5 mm apart (grid-aligned). A connector's `mate` names the mating connector; pins with the same
  number are joined in `netGroups`. Boxes have no rotation or mirror in M2.
- **Nested assemblies** use `rect.assembly` (a dashed outline carrying a designation) and `DeviceRec.parent`;
  the BOM nests children under their parent and guards against cycles. Outlines are drawn by the command
  `assembly/create` from a selection.
- **Macros** are `library/macros/*.json` (kind `macro`): elements with coordinates relative to the group.
  Placing renumbers each distinct designation to the next free number, contacts following their coil. Macros
  reference library symbols by id (company symbols need to exist in the target library). Company macros are
  saved to `company-library/macros`.
- **Generic parts** (`library/parts`, kind `part`): manufacturer is always "Generic", the title names the
  nominal rating class, the source says it is a CablePilot generic definition, and every part is `secondary`
  with its classes and dimensions listed in `docs/to-verify.md`. No manufacturer catalogue data.
- **BOM rows** are one per device part (designation, position of the main representation, quantity times units
  to build, code, description in the drawing language, manufacturer, user fields); a device with no part is
  listed and counted as missing; an option merges rows by part. CSV uses `;` and Italian headers for an Italian
  drawing language, `,` otherwise, UTF-8 with a byte order mark so spreadsheets open it correctly. XLSX is M3.
- **Duplicate designations** (rule 5, checked in M4) now mean two coils, two power parts or two boxes with the
  same full designation on pages of the same kind; contacts and single-line/multi-line pairs are not duplicates.
- **Page scans are cached per page object** (`shared/devices.ts`), so reports and cross-references recompute
  only the pages that changed; a test counts the scans.
- **No new dependencies.**

## M3

- **Wire numbers belong to net groups.** A net, and every net joined to it by an interruption point or a
  mated connector pin, carries one number, stored on each of its wires (`number`), so it prints and exports.
  The three schemes differ only in the counter: one per potential (default), one per page and column, or one
  global. The pattern (`{n:3}{suffix}`, `{page:2}.{col}.{n}`...) builds the text; the suffix comes from the wire
  class of the net's potential. Groups are taken in reading order (page, then left to right, top to bottom).
  Wires on single-line, data and report pages and bundles are not numbered. A number typed by hand sets
  `numberLocked`; automatic numbering keeps it and never gives a number twice.
- **Wire classes are keyed by potential.** `project.wireClasses` has one row per potential id plus `signal` for
  wires with no potential; `project.wireTypes` are named single-core types a wire can pick (`wireType`). The
  defaults are placeholders listed in docs/to-verify.md. Conductor colours are a project option (`wireColours`),
  off for new projects; the samples switch it on.
- **Terminals are the existing `terminal` symbol.** Its designation is the strip (`-X1`), its `value` the
  terminal number; placing one joins the strip of the last terminal on the page and takes the next number
  (`terminal/renumber` renumbers in reading order). The strip is a device, so its parts, end plates and
  nameplate follow the device rules; terminal parts (category terminals with a conductor cross-section) count
  once per terminal in the BOM, other parts once. Strip length is the sum of the `Width` data of the parts.
- **Cables are project records** (`project.cables`: designation, kind, part, ends, length). A multicore cable
  takes its cores from the wires that name it (`cable`, `core`); the part's `Cores` and `Core colours` give the
  spare cores. Ribbon and patch cables run pin n to pin n between two connectors, or between two named pins
  ("-A3:ETH" to "-A4:P1") as one straight-through link. Cables with a part are BOM rows.
- **Reports are tables computed from the schematic** (`shared/reports.ts`), cached per project, with the page
  scans and nets cached per page object, so an edit recomputes only the page that changed (tests count it).
  A report is drawn by a `report` element holding a window (`offset`, `rows`) of its table, so a long list
  continues on further pages; `report/pages` commands add the pages and "Complete report pages" adds the
  missing continuations. The CSV, XLSX and the pages show the same table. Texts follow the drawing language
  (`shared/reportText.ts`).
- **Torque table** shows every value with its source and the status "to be verified" until the part is
  `primary`; values are generic data in the library and listed in docs/to-verify.md.
- **XLSX, DXF and ZIP are written by us.** An XLSX workbook is a ZIP of a few XML parts (inline strings, one
  bold header style); the ZIP container is stored (uncompressed) and written in 60 lines, with a reader used by
  the tests. DXF is the documented ASCII format (AC1015: LWPOLYLINE, CIRCLE, ARC, TEXT out; those plus LINE,
  POLYLINE and MTEXT in); the import gives plain graphics (lines and texts, circles and arcs as segments) on a
  new page, scaled to fit, units from `$INSUNITS`. No dependency and no licence to carry.
- **PDF text is embedded.** Poppler (and some print paths) showed no text because the standard fonts were not
  embedded. The sans style now embeds Roboto Regular and Bold (SIL Open Font License 1.1, `shared/fonts/` with
  its licence file; embedding in documents is allowed) through `@pdf-lib/fontkit` (MIT), loaded from the
  renderer as data URLs. The serif and mono styles still use the standard fonts.
- **File format version 3** (`settings.numbering`, `settings.wireColours`, `wireClasses`, `wireTypes`,
  `cables`, the `report` element and the `bom` and `report` page types), with a migration from 2.
- **Screenshots for the website** are captured from the real built app by `npm run screenshots`
  (`e2e/screenshots.e2e.ts`, skipped in CI and unless asked for), committed under `site/img/`, and shown by the
  site build only when they exist and only for features whose milestone is done.
- **Deferred:** terminal parts cannot differ per terminal (the strip's first terminal part applies to all);
  nameplates have no size or colour options; DXF import ignores splines, hatches, blocks and layers; the
  wire-marker quantity is two per connection; the ERC checks for cables (cross-section against the cable, core
  count) are M4.

## M4

- **The check is a pure function of the project** (`shared/checks.ts`, `runChecks`), cached per project object
  and, for the rules that look at one page (loose wire ends, nets, colours, cross-sections, terminals), per page
  object together with what that page depends on (library, potentials, symbols, wire classes and types, cables,
  parts, devices, the stated method). An edit therefore rechecks only the page that changed (a test counts the
  page computations); the project-wide rules (duplicates, coils and contacts, PLC addresses, PE, potentials
  joined across pages) are cheap aggregations over the cached facts. A finding has a stable id, a page, an
  element and a position (the marker), the rule, plain arguments for the text, and optionally a `fix`: plain
  commands, so a fix is one undo step. "Fix all" applies the fixes one after another and re-runs the check
  between them, so two fixes never take the same choice (two duplicates get different numbers).
- **Rules and what they mean.** Duplicates: as decided in M2 (the later one is flagged, the fix renames it with
  `device/relink` to the next free number). Unconnected end: an end that touches no pin, junction or other wire;
  a wire loose at both ends has a "remove wire" fix. Coil without contacts: only for class K (relays and
  contactors, IEC 81346-2), so a valve coil is not asked for contacts; a power part counts as contacts. Contact
  without coil: a contact whose device has neither a coil nor a power part (an overload relay's contact is fine).
  Contacts used against available: summed over the device's parts' "Auxiliary contacts" and "Contacts" data; a
  changeover contact serves as one NO or one NC; nothing is said when no part states its contacts. Two potentials:
  per page net, and across pages through interruption points and mated connectors. PLC address: the `value` of
  PLC channel symbols, compared case-insensitively (racks and cards join in M5). Missing PE: live circuits drawn,
  but no PE potential and no connected earth symbol anywhere. Terminal wires: wire ends on a terminal pin against
  the part's "Conductors per connection" data, one when absent.
- **Cross-section check.** The protective device is a symbol with function breaker or fuse whose device has a
  part with "Rated current"; every conductor directly connected to it (both sides) must have a table capacity
  at least that rating, for the stated installation method (`settings.installationMethod`, empty: not stated, the
  check is skipped and one note says so). Assumptions are fixed and printed with the finding: PVC copper, 30 °C,
  three loaded conductors, no grouping, the device protects every conductor connected to it, no check outside
  1.5 to 35 mm². The table (`shared/ampacity.ts`) holds numbers recorded from secondary sources: every one is
  listed in `docs/to-verify.md`, the finding says the values are not yet verified, and it never claims to replace
  the engineer's verification. The fix gives the wires a wire type of the smallest tabulated size (new type
  `6mm2-BK`, same colour and type text).
- **Colour rules.** Protective potential not GNYE: error; GNYE on any other potential: error; neutral not blue:
  warning (a company may choose otherwise: only a warning). Core colours of cables are checked too; those have no
  one-click fix, wires do (a wire type with the right colour).
- **Findings in the UI.** A banner under the top bar (counts, "Fix all that can be fixed", show/hide), the
  findings in the message list (page link that selects the element, rule, standard, assumptions, one-click fix),
  and a round marker on the page at the finding's position, drawn on the canvas only (never in print preview or
  PDF). The list is capped at 200 rows.
- **Revisions are data in the project** (`project.revisions`, `project.issueStatus`, file format 4 with a
  migration from 3). Issuing is the command `revision/issue`: it stores the number, date, description, names and
  status, copies date, names and revision into the title-block properties, and takes a **snapshot**: a hash per
  page (canonical JSON, sorted keys, so it survives saving and reopening; pages that show a live report also hash
  the rows they show, so a BOM page counts as changed when the BOM changes; cover and contents pages hash without
  their generated body) and an inventory of devices (position, text, parts, fields), wires (number, ends,
  cross-section, colour, type, core) and parts (code and quantity), each as a short hash or a number. Page hashes
  are cached per page object, so finding the changed pages after an edit hashes only that page. Changed pages are
  worked out against the last revision (added, changed, removed); comparison works between two revisions or a
  revision and the working copy and lists pages, devices, wires and parts.
- **Revision index of a sheet** is the last issued revision in which the page changed (revision 0 marks every
  page); the title block's revision field shows it, falling back to the project's revision field before the first
  issue. Unissued edits do not change it until the next issue. The cover shows a column per revision (the last
  six) with a cross where a sheet changed.
- **Cover sheet.** The cover page type is now the generated cover: title and project data, sheet index with the
  revision of every sheet, revision list (last eight), the four issue-status boxes, units to build, customer
  approval and signature block; the contents page also prints each sheet's revision. Texts follow the drawing
  language.
- **Samples are clean.** The three samples open with no findings (a test asserts it): supply ends carry
  potential tags (placed by the sample builder on every free end that names a potential), a PE feed with an
  earth symbol sits on each power page, PLC signal wires start on field terminals (strip -X2), power conductors
  are sized with the same one-click fixes the app offers, installation method B1 is stated, the star-delta
  timers and contactors got their auxiliary blocks. Each sample has revision 0 issued; the charger has revisions
  0 and 1, the second changing the battery string (54 to 55 cells), which changes the DC page, the BOM and
  nameplate pages, a device and a part quantity.
- **Website screenshots** for the checks block come from the real app: the conveyor sample with a second coil
  renamed to a duplicate designation and the installation method changed to A1 (the 6 mm² conductors on the 32 A
  breaker are then too small), captured by `npm run screenshots`.
- **No new dependencies.**

## M5 PLC

- **A card is a black box with `plc` set** (type, rack, slot), and its pins are the channels. This reuses wires,
  connectivity, devices, parts, the BOM and the cross-references; the card is a device with its library part. A rack
  is a rack name shared by cards plus slot numbers; the rack part is assigned to the CPU device. Chosen over a new
  element kind to avoid a second connectivity path.
- **Addresses are stored on the pins** (`address`, `tag`, `comment`), assigned by a command from the scheme, not
  computed on the fly: hand edits and imports then need no override layer, and the check, overview, report and tag
  lists read one place. Changing the scheme's style rewrites the spelling of the stored addresses, it never moves them.
- **Two notations.** Siemens (I0.0, Q0.1, IW64, word address = byte) and IEC 61131-3 (%IX0.0, %QX0.1, %IW32, word
  address = word index) are the same address in two spellings: the model keeps byte and bit, so they convert
  without loss. The duplicate check compares one canonical spelling (no percent sign, IX = I).
- **Default start bytes** (digital 0, analog 64) are editable company defaults, listed in `docs/to-verify.md`.
- **Tag lists.** CODESYS: the declaration text of a global variable list (AT syntax from the CODESYS Online Help),
  because it needs no archive or schema version. TIA Portal: the PLC tag table XML of the Openness layout, shipped
  marked "unverified" in the UI and in `docs/to-verify.md`, because Siemens' own documentation could not be
  reached and the layout rests on a published example of an exported table. We did not ship an Excel format: its
  header names are localised by TIA Portal and could not be verified at all.
- **Import never creates channels.** Tags are matched to existing channels by address and give them their name and
  comment; unmatched and invalid rows are listed in the preview. Names the export made up for untagged channels, or
  a tag in identifier form, are not changes, so exporting and importing the same project changes nothing.
- **Tag names are identifiers** on export (letters, digits, underscore, not starting with a digit, unique) so both
  tools accept them; the tag stored in the project keeps what the user typed.
- **File format 5** adds `settings.plc`; cards and channel fields are optional properties of boxes, so older files
  open unchanged. The conveyor and charger samples use cards; the pump station keeps channel symbols to show that
  they still work.

## M6 part 1: Sizing and warehouse

- **Feeders come from the schematic.** A feeder is a device with load data (or a motor symbol) and the series chain the
  nets show from it toward the supply: terminals, overload relays and contactors are walked through, the first breaker
  or fuse ends the chain. Wires on pages that are not numbered (single-line pages) and protective conductors are left
  out. A feeder fed from a shared bus with no breaker between would walk into its neighbours; the samples and the
  usual breaker-first layout do not, and this is listed as left in `docs/progress.md`.
- **Sizing order.** Breaker first (In >= Ib, three poles, curve, Icu >= Ik), then the cable and wires for the breaker's
  current (Ib <= In <= Iz, I2 <= 1.45 Iz, voltage drop). A breaker that meets its own requirement is "ok" even when it
  is larger than needed: the cable line then asks for the larger cable, the same direction the existing cross-section
  check fixes in. New choices are ranked smallest rating first. A motor protective breaker counts as set to Ib.
- **Star-delta:** every contactor is sized for Ib / sqrt(3), which is conservative for the star contactor; no starting
  current or electrical life is checked. DC loads and single-phase loads are not sized yet (three-phase AC only).
- **Part data for sizing** is a `Type` key (`MCB`, `MPCB`, `Contactor`, `Overload relay`, `Power cable`) plus the
  technical fields of that type; `check:library` enforces it. Parts without them are "data missing" and never
  suggested. New generic breaking capacities and an overload relay 12 to 18 A were added; all are generic classes in
  `docs/to-verify.md`.
- **Table values and the unverified flag.** The ambient and grouping factors and the voltage-drop constants are
  recorded from secondary sources, shipped as unverified (`CORRECTION_VERIFIED`, `VOLTAGE_DROP_VERIFIED`), listed in
  `docs/to-verify.md`, and every result that uses them says so. The existing cross-section check now applies the same
  factors (one table, no duplicate), so its finding text shows the ambient temperature and grouping.
- **Supply data** (voltage, Ik, ambient, grouping, voltage-drop limit) is a project setting (file format 6, migration
  5 to 6). Ik 0 means not stated: the breaking-capacity requirement is skipped and says so. Ambient temperature and
  grouping are offered only in the steps of the correction tables. Load data is on the device record (`load`);
  wire lengths are a manual `length` on a wire; a feeder's length is its cable's length, else its longest wire, else
  the load's own.
- **The warehouse belongs to the company, not the project.** The stock list, the saved column mapping, manual links and
  the stock date live in `warehouse.json` in the app's data folder, written by the main process; the renderer gets
  rows and never a path. Refresh and a watched folder (`fs.watch`, debounced) are in the main process too. Mapping
  is saved by header text, so a reordered file still maps. XLSX is read by our own small reader (`node:zlib` for
  deflate, shared strings, inline strings): no dependency. CSV falls back to Windows-1252 when it is not UTF-8.
- **Availability** = on hand - reserved - this project's use, where use is the BOM quantity (quantity per device times
  units to build) or, for cable stocked in metres, length times units. With several stock rows the use is taken from
  the largest free stock first. Items are linked by part code or by a manual link that survives refreshes.
- **Stock columns in the BOM are a view,** not a project setting: the BOM report on the drawing set stays free of stock
  data. The picking list uses the drawing language for its headers.
- **Samples changed** so that they ship sized: the conveyor's breaker is a 16 A MCB (the 32 A breaker was larger than its
  2.5 mm² cable can carry), its power wires are 2.5 mm² (a 1.5 mm² wire sat downstream of the 16 A breaker, which the
  old check did not look at), the pumps' relays are 12 to 18 A. "Size the whole project" is applied when the samples are
  generated, with no stock list, so they open with no findings and nothing to change.
- **Demo:** the sizing step opens the conveyor sample last, after the PDF and XLSX export of the charger sample, so the
  first six steps are unchanged.

## M6 part 2: CAD workspace with the AI inside

- **One engine for every entry point.** The ribbon, the command line, the context menu and the shortcuts run the same
  commands (`app/renderer/cad/run.ts`); interactive commands are chains of steps ("sessions", `cad/sessions.ts`). Pure
  parts (typed input, aliases and routing, snapping, selection, TRIM/EXTEND/OFFSET, grips) are in `shared/cad` and tested.
- **What counts as a command.** A typed text is a command only when its first word is a command or alias and nothing
  else follows (or the command takes arguments: INSERT, ZOOM, GRID...). "number the wires on this page" is therefore a
  request to the assistant, not NUMBER; one unknown word is reported as unknown, not sent to the assistant.
- **Keys.** On the canvas, printable keys start typing in the command line (CAD habit). Only V, W and F stay immediate
  single-key shortcuts (and R and M while placing a symbol), because M is MOVE and L is LINE now. The old drag-to-draw
  line and rectangle tools became the LINE and REC commands (point by point).
- **Coordinates** are page millimetres as the status bar shows them (origin top left, y down); angles are counter-
  clockwise on screen, so `@50<90` goes up the page. This keeps typed values equal to what the readout shows.
- **Layers** are an optional `layers` list in the project (overrides of the five built-in layers, which map the drawing
  style groups, and user layers) plus an optional `layer` on elements. Absent data means the defaults, so the file
  format version stays 6. Off layers are not drawn or printed; locked layers cannot be picked from the canvas.
- **Circle.** A `circle` element (centre, radius) was added so that the usual C command has something to draw.
- **Docking** is a dock selector per panel with resizable splitters (also by keyboard), not drag-and-drop between docks:
  simple, testable and enough. The layout is part of the settings file (`layout`), validated on read.
- **AI.** The provider interface and the built-in provider are in `app/main/ai`; the request carries the project, the page
  and the selection, the answer text, claims with a source (project, standard, library, suggestion) and an optional
  proposal (commands). The renderer previews the proposal as a project that is not in the history, highlights what it
  adds or changes, and applies it as one batch on Accept. A proposal made for an older state of the project is dropped.
  The built-in provider is deterministic and offline and states that free-form requests need an API key (M7).

## M6 part 3: Cabinet layout

- **A layout page is drawn in real millimetres.** `Page.layout = { view: 'front' | 'door' | 'side', w, h }` marks it
  and gives its drawing extent; its elements are `cab` elements (enclosure, plate, rail, duct, device, zone, cover,
  dim) in page millimetres. Every CAD tool therefore works unchanged (snaps, typed coordinates, grips, MOVE, ROTATE,
  layers) and typed values are real sizes. The sheet gets the drawing at a standard scale (ISO 5455 series) with the
  text sizes and line weights scaled, so the PDF prints in the company frame at 1:5, 1:10... A page without `layout`
  (a DXF imported as plain graphics, or from an older project) is drawn as before. File format 7, migration 6 to 7 adds
  `settings.layout`.
- **Devices are links, not copies.** A device on the layout carries its full designation; its parts, name and the
  rest are the schematic's. Its size is stored (so it can be edited, or come from an imported outline) and refreshed
  from the part's dimensions by "Size from the part" and by the ERP item master import. Devices that are not in the
  cabinet (motors, sensors, battery cells, cables) are known by the part's `mount` (`rail`, `plate`, `door`, `field`,
  `none`), with a default per category; only cabinet devices appear in "not yet placed".
- **Layout parts in the BOM come from the layout.** Enclosure, plate, rails and ducts with a part are BOM rows computed
  from the layout (rails and ducts by length over the part's nominal length), not project parts, so they follow edits.
- **Suggestion: rows on rails, pinned items.** The engine tries library enclosures from the smallest up (the plate is
  at least 100 mm smaller each way; the area for devices, clearances and ducts plus the spare percentage must fit),
  packs devices into rows (power, plate-mounted, control, terminals; schematic order inside a group), puts a rail
  under every rail row, a duct above and below every row and a vertical duct, and upsizes the ducts one library
  size at a time until the fill is under the limit. Door devices go on the door page. An item the user placed, moved
  or locked (its `auto` flag is gone, or `locked`) is pinned. When anything is pinned the structure (enclosure,
  plate, rails, ducts) stays as it is and only devices are placed again: first on free room of the existing rails, by
  the group already there, then in new rows around the pinned items. Moves and edits clear `auto`, so "moved items stay
  put" needs no extra bookkeeping.
- **Previews reuse the proposal mechanism.** A suggestion, a layout import and an item-master import are `Proposal`s
  shown through the chat panel's preview (Accept / Reject, one undo step), with the rules as claims and their sources.
  The fake provider answers "suggest a layout", "move the PLC to the right and rearrange" and "explain the layout".
- **Wire lengths and duct fill share one router.** Ducts are a graph of centre lines; a device attaches to the nearest
  duct point; a wire is routed device to device through the graph (Dijkstra) plus a slack per end; without ducts it is
  the Manhattan distance. The wire list shows `~1.2` for an estimate; a typed length (`WireEl.length`,
  `CableRec.length`) always wins. Cable metres in the BOM and the warehouse use the typed length, else the routed
  length between the cable's two ends when both are devices on the layout. External cables are never estimated.
- **Exchange.** JSON and CSV in the documented format (`docs/layout-format.md`), coordinates from the plate corner,
  devices matched to the schematic. Item-master sizes reuse the warehouse column mapping (width, height, depth added
  to its fields) and are stored as `part/dims` on the project's copy of the part. Files and a watched folder are read in
  the main process (`app/main/layoutFiles.ts`); no live ERP connection.
- **3D with three.js and @react-three/fiber (both MIT).** Boxes from the dimensions, an orbit control made with
  three's own OrbitControls (no drei). The module is a lazy import: it loads when the view opens, so startup is
  unchanged. Packages: `three`, `@react-three/fiber` (and its small dependencies) and `@types/three`, all development
  dependencies bundled by Vite like the rest of the renderer.
- **Layout checks are not ERC findings.** Overlaps, devices outside the plate, in a zone, too deep, ducts over their
  limit and unplaced devices show in the layout window, so the samples' rule check stays about the schematic.
- **Samples.** Every sample ships with the suggested layout (front and side views; the conveyor and the charger also
  have a door page); the generator replaces the placeholder layout page after the parts are final.

## M7 AI assistant

- **No SDK, `fetch` for all three providers.** The owner's MechPilot uses the Anthropic SDK; here Claude goes through
  `fetch` like OpenAI and Gemini (brief: through `fetch`), so there is no new dependency and one `http.ts` handles
  timeouts, cancel and plain error kinds. Request/response mapping is pure and tested from recorded fixtures.
  API shapes: Anthropic Messages (`x-api-key`, `anthropic-version: 2023-06-01`, tools with `input_schema`, prompt-cache
  marker on system and tools), OpenAI Responses (`store: false`, reasoning items replayed), Gemini `generateContent`
  (key in the `x-goog-api-key` header, never in the URL; thought signatures replayed).
- **Models are settings.** Defaults from the brief: `claude-sonnet-5-5` and fast `claude-haiku-4-5-20251001`;
  `gpt-5.1` / `gpt-5.1-mini` and `gemini-3.1-pro` / `gemini-3.1-flash` as in MechPilot. The user can type any model id.
- **Keys.** Electron safeStorage only; without OS encryption the key is not saved (a plain file is not safe). In
  development (app not packaged) a key may come from the environment or `.env.local` (git-ignored). With `CP_AI_FAKE=1`
  (tests, screenshots, the demo) a scripted stand-in answers, keys are only encoded, and no provider is ever called.
- **Without a key the built-in assistant stays.** The M6 part 2 deterministic assistant answers when no key is stored,
  so the app is fully usable without AI and the earlier tests keep their meaning.
- **One proposal per reply.** The model may call several propose tools; they are validated one after the other (later
  ones see the earlier ones applied) and merged into one preview and one undo step.
- **The model never types a rating.** Parts for `device/update` and `cable/set` must exist in the library or the
  project (`find_parts`); ratings come from the sizing engine (`size_feeder`, `propose_starter`, `propose_sizing`).
  Command types that change standards-bound data or the file's history (`revision/issue`, `issue/status`,
  `project/settings`, `projectPart/set`, `part/embed` by hand, templates, assets) are not offered to the model.
- **Sources.** Tool results carry their claims (project, standard and clause from the check rules and the sizing
  assumptions, library entry from part codes). Claims written by the model are checked: a library entry that does not
  exist or a "standard" that is not a standard name is downgraded to "suggestion". Anything electrical the model
  states itself gets a "suggestion, confirm before use" claim.
- **Assumptions are explicit.** For "a 7.5 kW motor" the nameplate current, cos φ and efficiency are usually unknown:
  the model passes typical values only as declared assumptions, shown as a suggestion to confirm, and the tool refuses
  to size without any (it says what is missing). The scripted stand-in assumes cos φ 0.85 and efficiency 90 %.
- **A starter on a full page goes on a new power page** inserted after it, in the same proposal and undo step.
- **Limits.** 10 tool rounds, 120 s per request, 30 requests per 10 minutes, prompt 2,000 characters, 8 earlier turns.
- **Library.** `library/macros/star-delta-starter.json`, drawn from the pump-station sample (generic symbols, ratings
  not part of the macro, a PE stub so a new page does not trigger the missing-PE check).

## M8 part 1: ERP link

The owner asked (2026-10-26) for a two-way link with the ERP: pick parts from the warehouse, and data shared both
ways. No specific ERP was named, so the conservative choice is one generic connector rather than one per product.

- **HTTP with JSON, OData v4 included.** Most ERPs offer it (SAP S/4HANA and Business Central speak OData v4; Odoo,
  ERPNext and many others have REST JSON endpoints). The connector reads an array of records at a configurable path
  (`value` for OData, empty for a top-level array) and follows a next-page link at a configurable path
  (`@odata.nextLink`). Nested fields are flattened with dots (`Inventory.OnHand`). Product-specific connectors (Odoo
  JSON-RPC, SAP Business One Service Layer) can come later if companies ask; no SQL driver is added (it would need a
  native dependency per database).
- **Records become rows.** The pulled records are turned into the same rows a stock file gives (header = every field
  name, in first-seen order), so the column-mapping wizard, the saved mapping, availability, sizing suggestions and
  the item-master sizes all work unchanged. The ERP is a third source next to "file" and "watched folder".
- **Credentials.** Authentication none, basic (user + password), bearer token, or an API-key header. The password or
  token is encrypted with safeStorage exactly like the AI keys (not stored at all without OS encryption), lives only
  in the main process and is scrubbed from every error. Plain `http://` is allowed (ERPs on the company network often
  have no certificate) but the settings warn when credentials would travel unencrypted to a host that is not the
  computer itself.
- **Limits.** 30 s per request, 50 pages, 100,000 records, 50 MB per response; automatic refresh at least every
  5 minutes when switched on.
- **Writing back is a reservation request, never a direct stock change.** CablePilot does not know the ERP's
  business rules, so it sends a documented, versioned document (`cablepilot-reservation`, version 1: project, order
  number, units to build, and per stock code the quantity this project needs with its unit, devices, warehouse and
  location) and the ERP (or a small adapter the company writes) decides what to do with it. It is shown as a preview
  and only sent when the user presses Send. Targets: HTTP POST of the JSON to a configured URL, or the JSON and a CSV
  written to an outbox folder (for ERPs that import files). After sending, the stock is pulled again so the reserved
  quantities the ERP set show up.
- **Picking from the warehouse** assigns the stock item to the selected device as one undoable command: the linked
  library part when there is one (so sizing has its data), otherwise a project part made from the ERP item (code,
  manufacturer, description; source "ERP item", verification secondary). Such a part carries no technical data, so
  sizing still shows it as "data missing" and never proposes it for a rating (rule 12 unchanged).
- **Demo ERP.** A small HTTP server inside the main process, on 127.0.0.1 and a random port, started only on request:
  it serves the generic sample stock list as OData v4 in pages of 25 and accepts reservations (raising "reserved").
  It shows the whole two-way flow without a real ERP (rule 10) and is what the end-to-end test talks to.

## Dependencies

All development dependencies, none shipped in a runtime `dependencies` list yet (Electron-vite
bundles the renderer; the main process uses only Electron and Node).

| Package | Licence | Why |
| --- | --- | --- |
| electron | MIT | Desktop shell for macOS, Windows and Linux (brief). |
| electron-vite | MIT | Build tooling for main, preload and renderer (brief, same as MechPilot). |
| vite | MIT | Bundler used by electron-vite and Vitest. |
| @vitejs/plugin-react | MIT | React transform for the renderer. |
| react, react-dom | MIT | UI (brief). |
| zustand | MIT | UI state (brief). |
| typescript | Apache-2.0 | Strict typing (brief). |
| vitest | MIT | Unit tests (brief). |
| @playwright/test | Apache-2.0 | End-to-end tests of the built app (brief). |
| @types/node, @types/react, @types/react-dom | MIT | Type definitions. |
| pdf-lib (runtime) | MIT | PDF export of pages at true scale (M1). |
| ajv | MIT | Dev only: checks project files against the JSON Schema in tests (M1). |
| three | MIT | 3D view of the cabinet (M6 part 3): devices as boxes from their dimensions, loaded only when the view opens. |
| @react-three/fiber | MIT | React renderer for three.js (brief: 3D through @react-three/fiber); with its small dependencies (its-fine, react-use-measure, scheduler, suspend-react, zustand). |
| @types/three | MIT | Type definitions of three. |
| @pdf-lib/fontkit | MIT | Embeds the TrueType font in the PDF export so text shows in every viewer (M3). |
| Roboto Regular and Bold (font files, not a package) | SIL OFL 1.1 | Bundled in `shared/fonts/` with its licence; embedded as a subset in PDFs. Taken from the `@expo-google-fonts/roboto` package (MIT wrapper); only the two TTF files and the font licence are copied. |

The full transitive list, with licences, is in `THIRD_PARTY_LICENSES.md` after `npm run build`.
