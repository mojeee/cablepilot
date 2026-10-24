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

The full transitive list, with licences, is in `THIRD_PARTY_LICENSES.md` after `npm run build`.
