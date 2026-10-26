# CablePilot: project context for Claude

Read this file fully before any work. It says what we are building, the rules that never change, the
stack and structure already decided, and how every milestone ends. If a request conflicts with this
file, point it out before coding. The full original brief is in `docs/brief.md`; the production
drawing-set requirements are in `docs/reference-drawing-check.md`; the milestone checklists are in
`docs/roadmap.md`; choices made along the way are in `docs/decisions.md`.

## What we are building

CablePilot is a source-available (CablePilot License 1.0), local-first desktop app for macOS, Windows
and Linux for electrical design of machines, control panels and electronics: free for a 30-day trial,
then a paid licence key. No account, no cloud. An optional AI assistant uses the user's own API key. A marketing website is generated from the repo into `/site`.

- **Phase 1, machines and panels:** multi-page schematic projects with IEC symbols, reference
  designations, cross-references and automatic wire numbers; reports generated live from the
  schematic (terminal diagrams, cable lists, wire lists, PLC I/O lists, BOM); a cabinet layout to
  scale in 2D with a 3D view; PDF drawing sets and workshop exports in the company's own frame and
  title block, with revisions and a cover sheet the customer signs off.
- **Phase 2, electronics:** schematic capture for circuits and a 3D board view; interoperate with
  KiCad's open file formats first (import and export) rather than build a full PCB editor in v1;
  PCB layout later, if users ask for it.

Out of scope for v1: circuit simulation, PLC programming, cloud collaboration, importing proprietary
formats (EPLAN, AutoCAD Electrical project files).

## Who it is for

Electrical design companies: the electrical departments of machine builders, control-panel builders,
system integrators and automation engineers; later, electronics design offices. They draw multi-page
schematics, produce terminal, cable and wire lists for the workshop, lay out the cabinet, and hand
over PDF drawing sets and BOMs. Today they pay for EPLAN, AutoCAD Electrical or SEE Electrical, or
draw in plain CAD. The app must feel professional to them in the first ten minutes.

## Product rules (never break these)

1. **The schematic is the single source of truth.** Every report, list, cross-reference and the
   cabinet layout are generated from it and update live. Nothing is typed twice. Changing a device in
   one place updates every place it appears.
2. **Standards, with sources.** Symbols: IEC 60617. Reference designations: IEC 81346
   (=function +location -product). Document conventions: IEC 61082. Electrical equipment of machines:
   IEC 60204-1 (conductor colours, protective bonding). Cable current-carrying capacity: IEC 60364-5-52.
   Assemblies: IEC 61439. Conductor identification: IEC 60445; colour abbreviations (BK, BU, RD, GY,
   OG, GNYE...): IEC 60757. Drawing sheets and title blocks: ISO 5457 and ISO 7200; lettering:
   ISO 3098. North America, as an option: NFPA 79 and ANSI/IEEE symbols. Every rule and every table
   value in code cites its standard and clause in a comment. Never invent a value: unverified values
   go to `docs/to-verify.md` and are not shipped as facts. A check that depends on installation
   conditions (cable sizing, voltage drop) shows its assumptions and says it does not replace the
   engineer's verification.
3. **The files belong to the user.** An open, documented project format: versioned JSON with a schema
   and migrations, stable ordering so it diffs well in Git. Autosave and crash recovery. PDF, DXF and
   CSV/XLSX out; DXF in. No lock-in.
4. **Undo everything,** including AI edits, imports and automatic renumbering.
5. **Continuous checks (electrical rule check).** The checker finds: duplicate reference designations;
   unconnected wire ends; coils without contacts and contacts without a coil; more contacts used than
   the device has; two potentials connected together; conductor cross-section against the protective
   device and the stated installation method; conductor colour against the potential type; a missing
   PE connection; more wires on a terminal than it allows; a PLC address used twice. Each finding
   appears on the page, in a list and in a warnings banner, with a one-click fix when the fix is a
   plain edit.
6. **Honest AI (optional).** The assistant proposes changes as a preview that the user accepts or
   rejects; it never edits silently. Every claim shows its source: read from this project, a standard
   and clause, a library entry, or "suggestion". Electrical values the AI proposes (a breaker rating,
   a cable size) are always labelled "suggestion", with their assumptions, and must be confirmed by
   the user. The app is fully usable without AI.
7. **Fast.** Projects with 500 pages and 5,000 devices stay responsive; reports regenerate
   incrementally. Performance budgets have tests.
8. **Professional, still clear.** Keyboard-first, with the shortcuts electrical CAD users expect.
   Errors in plain language. English and Italian from day one.
9. **Device data, legally.** Generic parts ship with the app (contactors, relays, MCBs, motor
   protection, terminals, PLC I/O cards, cables, enclosures; for DC and power-electronics panels:
   batteries, diodes, rectifier and inverter modules, DC/DC converters, hall-effect current sensors,
   EMI filters, transformers with vector group, phase-monitoring relays, HMI panels, network switches,
   RJ45 sockets), with dimensions, electrical data and their sources. Users import manufacturer data
   from files they are licensed to use. We never scrape or ship manufacturer catalogues without
   permission.
10. **Demo mode.** Sample projects ship with the app, so every feature can be shown and tested without
    user files.
11. **Production-ready drawing sets.** A finished project must print as a complete set that a workshop
    builds from and a customer signs off, with nothing drawn by hand afterwards: cover sheet with
    sheet index and revision status, project data sheets, legends, single-line and multi-line
    diagrams, terminal and cable pages, nameplates, a dimensioned cabinet layout and a BOM, all in the
    company's own frame, title block and drawing style. `docs/reference-drawing-check.md` lists what a
    real set of this kind contains; every row must be possible before release 1. Nothing from the
    third-party reference drawing (company, numbers, part codes) is copied into the repo.

## Stack (decided; same as BoardPilot and MechPilot so conventions carry over)

- **Shell and UI:** Electron + electron-vite, TypeScript strict, React, Zustand, plain CSS with design
  tokens (`app/renderer/styles/tokens.css`). Dark UI by default with a light theme; the drawing canvas
  can be dark or white; print preview is always white. No component library.
- **2D:** our own page renderer on Canvas 2D with a spatial index for picking and snapping; vector PDF
  export at true scale.
- **3D cabinet view:** three.js through `@react-three/fiber`, devices as boxes from their dimensions
  (added in M6). Real STEP models later, through OpenCascade in a worker.
- **AI (optional):** Claude (default `claude-sonnet-5-5`, fast `claude-haiku-4-5-20251001`), OpenAI or
  Gemini through `fetch`. Called only from the main process. Keys are stored with Electron
  `safeStorage`. No key is available during development: build and test against a fake provider; the
  real-key test is skipped when no key is set.
- **Tests:** Vitest for logic (connectivity and netlist, numbering, cross-references, reports, checks,
  file format, i18n); Playwright for end-to-end tests of the built app (`e2e/`).
- **Security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a typed API
  through the preload script. The renderer never sees API keys or the file system directly.
- **Languages:** English and Italian. Every user-facing string goes through `t()` from `shared/i18n`
  with an Italian entry in `shared/i18n/it/*.ts`, enforced by `tests/i18n.test.ts`. Text printed on
  drawings (report headers, legends, title-block labels) follows the project's drawing language, not
  the UI language.

### Licences

- Our code: CablePilot License 1.0, source-available (`LICENSE.md`, `NOTICE`), like BoardPilot's: the code
  is public, use is free for a 30-day trial per computer, then needs a licence key (`CP1-…`, Ed25519-signed,
  checked offline in `app/main/license/`; issued with `scripts/make-license.mjs` from the private key in
  `~/.cablepilot/`, which never enters the repository). Never remove or weaken the check; the trial length
  can be changed only in an unpackaged build (`CP_TRIAL_DAYS`, for tests). The end of the trial never
  locks a user out of their drawings: the file format stays open and documented. Versions up to commit
  `01271c2` were released under Apache-2.0. Copyright holder: Mojtaba Amini.
- Library data in `library/`: CC BY 4.0 (`library/LICENSE`).
- No GPL or AGPL dependencies, ever. KiCad is GPL: its file formats are documented and we may read and
  write them, but never copy KiCad code. `npm run check:licenses` lists every dependency's licence and
  fails on GPL or AGPL; CI runs it. `THIRD_PARTY_LICENSES.md` is generated at build time.
- Small, well-maintained dependencies under MIT, Apache-2.0, BSD or ISC need no approval; list each
  one with its reason in `docs/decisions.md`.

## Folder structure

```
/app
  /main         Electron main: files, PDF/DXF/CSV/XLSX export, AI provider calls, settings (safeStorage)
  /preload      contextBridge API (typed through shared/api.ts)
  /renderer     UI: components, canvas, panels, state (zustand), styles (tokens.css)
/shared         types, connectivity, file format, report generators, checks, i18n
/library        symbols, devices, terminals, cables, page frames and title blocks as data files
/samples        sample projects shipped with the app (demo mode)
/docs           brief, roadmap, decisions, progress, to-verify, website, user docs
/site           the generated static website (committed; Cloudflare Pages serves it as is)
/scripts        build-site.mjs, check-site.mjs, check-licenses.mjs, check-library.mjs, e2e.mjs
/tests          Vitest unit tests
/e2e            Playwright end-to-end tests of the built app
```

## Architecture

- **Pure data plus a command layer.** The project model is pure data in `/shared`; connectivity (nets
  and potentials) is computed from it. Every user action, import and AI proposal is a command with
  do/undo, so undo, autosave and AI go through one path. Nothing in the UI mutates the project
  directly.
- **Main process.** Owns the file system, exports, settings and AI calls. The renderer asks through
  the typed API in `shared/api.ts`; every call returns errors as `{ code, message, hint }` in a
  result object, never raw exceptions.
- **Library data.** Every file under `/library` carries its `source` (standard and clause, or
  catalogue) and is checked by `scripts/check-library.mjs`.

## Design tokens

Dark UI (default) and light UI, switched with `data-theme` on `<html>`; the canvas theme is separate
(`data-canvas="dark" | "white"`). System font stacks only (no web fonts: the app works offline).
Layout: top bar 44px, page navigator on the left, symbol/device browser beside it, canvas in the
centre, properties panel 300px on the right, message list at the bottom.

## Conventions

- TypeScript strict; no `any` in `/shared` or `/app/main`.
- Every user-facing string goes through `t()` with an Italian entry (the i18n test enforces it). UI
  text is for professionals, in plain words.
- Connectivity, numbering, reports and checks have unit tests; every bug fix gets a test.
- Every rule and table value from a standard cites standard and clause in a comment; unverifiable
  values go to `docs/to-verify.md`, never into code.
- Secrets never go in the renderer or in git. No email address is published anywhere (code, docs,
  site). Companies get in touch through GitHub Discussions and issues.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Run and test

```bash
npm install
npm run dev                  # the app, with hot reload
npm run typecheck            # node + web projects, strict
npm test                     # Vitest
npm run check:licenses       # fails on GPL/AGPL; npm run build also writes THIRD_PARTY_LICENSES.md
npm run check:library        # every library/ file has its source and required fields
npm run build                # production build into out/
npm run test:e2e             # builds, then Playwright drives the built app
npm run build:site           # regenerate /site from docs/roadmap.md, CHANGELOG.md and library/
```

## How every milestone ends

1. The app runs with `npm run dev`.
2. `npm run typecheck`, `npm test`, `npm run check:licenses`, `npm run check:library`, `npm run build`
   and `npm run build:site` pass.
3. The sample projects open and work.
4. A `CHANGELOG.md` entry, one commit on `main`. Push only when the owner has asked for it.
5. A short entry in `docs/progress.md`: what works, what is left, anything the owner must do by hand.
6. The checklist in `docs/roadmap.md` is ticked and the site rebuilt.

## When to stop and ask

Only for: a GPL or AGPL licence, a paid service, anything that writes outside the repository, or
anything that publishes (releases, tags, posts). For a choice between reasonable options, take the
conservative one, write it with the reasons in `docs/decisions.md` and carry on.

## Website

`https://cablepilot.agentflowbind.com`, static, built by `scripts/build-site.mjs` into `/site`
(English at `/`, Italian at `/it/`; canonical links, sitemap and Open Graph use that URL). See
`docs/website.md`. Status, Available/Planned tags and the AI wording come from the ticked boxes in
`docs/roadmap.md`; the assistant is described as shipped only when `## M7-AI Assistant` is ticked.
