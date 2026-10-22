# New project: CablePilot — open-source electrical design app for machines, control panels and electronics

You are starting a new open-source product in an empty repository. Read this whole brief before doing
anything. The open decisions are already made (see "Decisions already made" near the end): turn this
brief into the project's CLAUDE.md and roadmap, then build it milestone by milestone.

If the repository mojeee/boardpilot is attached to this session, read it as a reference only: its
CLAUDE.md, scripts/build-site.mjs, .github/workflows/, e2e/, shared/i18n/, shared/schematic.ts,
shared/drawingSet.ts and app/main/ai/ show the conventions I want here (same stack, same way of
working). Do not copy its product code.

## Who it is for

Electrical design companies: the electrical departments of machine builders, control-panel builders,
system integrators and automation engineers; later, electronics design offices. They draw multi-page
schematics, produce terminal, cable and wire lists for the workshop, lay out the cabinet, and hand over
PDF drawing sets and BOMs. Today they pay for EPLAN, AutoCAD Electrical or SEE Electrical, or draw in
plain CAD. The app must feel professional to them in the first ten minutes.

## What we are building

A local desktop app (macOS, Windows, Linux), open source (Apache-2.0), local-first, no account, with an
optional AI assistant that uses the user's own API key, and a marketing website generated from the repo.
It is built in two phases.

- **Phase 1, machines and panels:**
  - multi-page schematic projects with IEC symbols, reference designations, cross-references and
    automatic wire numbers;
  - reports generated live from the schematic: terminal diagrams, cable lists, wire lists, PLC I/O
    lists, BOM;
  - a cabinet layout to scale in 2D, with a 3D view;
  - PDF drawing sets and exports for the workshop.
- **Phase 2, electronics:**
  - schematic capture for circuits and a 3D board view;
  - interoperate with KiCad's open file formats first (import and export) rather than build a full PCB
    editor in v1;
  - PCB layout later, if users ask for it.

Out of scope for v1: circuit simulation, PLC programming, cloud collaboration, importing proprietary
formats (EPLAN, AutoCAD Electrical project files).

## Product rules (never break these)

1. **The schematic is the single source of truth.** Every report, list, cross-reference and the cabinet
   layout are generated from it and update live. Nothing is typed twice. Changing a device in one place
   updates every place it appears.
2. **Standards, with sources.**
   - Symbols: IEC 60617.
   - Reference designations: IEC 81346 (=function +location -product).
   - Document conventions: IEC 61082.
   - Electrical equipment of machines: IEC 60204-1 (conductor colours, protective bonding).
   - Cable current-carrying capacity: IEC 60364-5-52.
   - Assemblies, where relevant: IEC 61439.
   - North America, as an option: NFPA 79 and ANSI/IEEE symbols.

   Every rule and every table value in code cites its standard and clause in a comment. Never invent a
   value: unverified values go to docs/to-verify.md and are not shipped as facts. A check that depends
   on installation conditions (cable sizing, voltage drop) shows its assumptions and says it does not
   replace the engineer's verification.
3. **The files belong to the user.** An open, documented project format: versioned JSON with a schema and
   migrations, stable ordering so it diffs well in Git. Autosave and crash recovery. PDF, DXF and
   CSV/XLSX out; DXF in. No lock-in.
4. **Undo everything,** including AI edits, imports and automatic renumbering.
5. **Continuous checks (electrical rule check).** The checker finds:
   - duplicate reference designations;
   - unconnected wire ends;
   - coils without contacts, and contacts without a coil;
   - more contacts used than the device has;
   - two potentials connected together;
   - conductor cross-section against the protective device and the stated installation method;
   - conductor colour against the potential type;
   - a missing PE connection;
   - more wires on a terminal than it allows;
   - a PLC address used twice.

   Each finding appears on the page, in a list and in a warnings banner, with a one-click fix when the
   fix is a plain edit.
6. **Honest AI (optional).** The assistant proposes changes as a preview that the user accepts or
   rejects; it never edits silently. Every claim shows its source: read from this project, a standard
   and clause, a library entry, or "suggestion". Electrical values the AI proposes (a breaker rating, a
   cable size) are always labelled "suggestion", with their assumptions, and must be confirmed by the
   user. The app is fully usable without AI.
7. **Fast.** Projects with 500 pages and 5,000 devices stay responsive; reports regenerate
   incrementally. Performance budgets have tests.
8. **Professional, still clear.** Keyboard-first, with the shortcuts electrical CAD users expect. Errors
   in plain language. English and Italian from day one.
9. **Device data, legally.** Generic parts ship with the app (contactors, relays, MCBs, motor
   protection, terminals, PLC I/O cards, cables, enclosures), with dimensions and electrical data and
   their sources. Users import manufacturer data from files they are licensed to use. We never scrape or
   ship manufacturer catalogues without permission.
10. **Demo mode.** Sample projects ship with the app, for example a conveyor with a motor starter and a
    PLC, and a pump-station panel, so every feature can be shown and tested without user files.

## Stack

Use the same stack as BoardPilot, so the conventions carry over.

- **Shell and UI:** Electron + electron-vite, TypeScript strict, React, Zustand, plain CSS with design
  tokens. Provide dark and light themes; schematics are usually printed on white.
- **2D:** our own page renderer on Canvas 2D, with a spatial index for picking and snapping; vector PDF
  export at true scale.
- **3D cabinet view:** three.js through @react-three/fiber, with devices as boxes from their dimensions.
  Real STEP models of devices come later, through OpenCascade in a worker.
- **Tests:** Vitest for logic (connectivity and netlist, numbering, cross-references, reports, checks,
  file format); Playwright for end-to-end tests of the built app.
- **Licences:**
  - Our code is Apache-2.0.
  - No GPL or AGPL dependencies. KiCad itself is GPL, but its file formats are documented and we may
    read and write them; never copy KiCad code.
  - A CI step lists every dependency's licence and fails on GPL or AGPL.
- **Other dependencies:** see "When you would have to ask me" under the decisions below.

## Architecture

- **Folders:**
  - `/app/main`: files, PDF/DXF/CSV/XLSX export, AI provider calls, settings with keys encrypted by
    Electron safeStorage.
  - `/app/preload`: typed API.
  - `/app/renderer`: UI.
  - `/shared`: types, connectivity, file format, report generators, checks.
  - `/library`: symbols, devices, terminals, cables, page frames and title blocks as data files, checked
    by a validation script.
  - Also: `/samples`, `/docs`, `/site` (the generated website), `/tests`, `/e2e`.
- **Pure data plus a command layer:** the project model is pure data in `/shared`, and connectivity
  (nets and potentials) is computed from it. Every user action, import and AI proposal is a command with
  do/undo.
- **Security:** contextIsolation on, nodeIntegration off. The renderer never sees API keys or the file
  system directly.

## Milestones

Every milestone ends the same way: the app runs with `npm run dev`, the tests pass, the sample projects
work, there is a CHANGELOG entry, and one commit.

- **M0 Scaffold:**
  - repo, CLAUDE.md, roadmap, licence files;
  - CI: typecheck, unit tests, licence check;
  - the app with its main layout: top bar, page navigator, canvas, properties panel, symbol and device
    browser, message list;
  - website skeleton.
- **M1 Schematic editor:**
  - a project with pages of different types: cover, contents, power, control, PLC, terminals, cables,
    layout;
  - a page frame with column and row zones and an IEC title block;
  - an IEC 60617 symbol library as data: graphics, connection points, function type;
  - place, move, rotate and mirror;
  - orthogonal wires with auto-connect and junctions;
  - potentials (L1/L2/L3/N/PE, 24 V DC, 0 V);
  - IEC 81346 designations with automatic numbering;
  - undo, save, PDF export of pages.
- **M2 Devices and cross-references:**
  - a device is one or more symbols (coil and contacts, multi-pole breakers), with main and auxiliary
    functions;
  - contact images under coils;
  - cross-references as page.column;
  - interruption points between pages;
  - black boxes;
  - parts assigned from the library;
  - BOM.
- **M3 Wires and reports:**
  - automatic wire numbering (potential-based, page-column or sequential);
  - terminals and terminal strips, generated from the schematic;
  - cables with cores;
  - reports, all live: terminal diagrams, cable list, wire list (from, to, cross-section, colour),
    BOM, contents;
  - exports: PDF drawing set, CSV and XLSX, wire-marker lists;
  - DXF import and export of pages.
- **M4 Checks:** the electrical rule check (rule 5), with the warnings banner and one-click fixes.
- **M5 PLC:**
  - PLC racks and I/O cards as devices;
  - an I/O assignment overview;
  - tag lists exported and imported in the formats TIA Portal and CODESYS accept. Verify each format
    against the vendor documentation before you ship it, and cite that documentation in the code.
- **M6 Cabinet layout:**
  - enclosure and mounting plate from the library, DIN rails and wire ducts;
  - devices placed from the BOM at real size, in a 2D front view to scale;
  - a 3D view of the cabinet;
  - duct fill rate;
  - wire lengths estimated along the ducts;
  - a mounting-plate DXF for drilling;
  - the layout in the PDF set.
- **M7 AI assistant:**
  - providers: Claude, OpenAI or Gemini with the user's key, called only from the main process;
  - it sees the project, the current page, the selection and the check results;
  - tools to read the project, find devices, run the checks and propose commands, for example "add a
    star-delta starter for a 7.5 kW motor on page 5", "renumber the wires on pages 3–8", "why does the
    check say Q3 is too small?";
  - each proposal shows as a highlighted preview with Accept / Reject and goes into undo;
  - tested against a fake provider in CI; a test against a real key is written but skipped until a
    key is set.
- **M8 Release 1 (end of phase 1):**
  - release builds from a git tag: macOS dmg (arm64 and x64), Windows installer, Linux AppImage
    (unsigned at first, ready for signing);
  - the website (below), with screenshots from the real app;
  - docs: getting started, the project file format, how numbering works;
  - end-to-end tests of every main workflow;
  - a launch checklist.
- **M9 and later, phase 2 electronics:**
  - electronic schematic capture with IEC and ANSI symbols, nets and an electronics ERC;
  - KiCad schematic, symbol and footprint import and export;
  - a 3D board from the footprints;
  - BOM.

  Decide on PCB layout together with me after M9.

## Website (generated from the repo into /site, static, English and Italian)

- **Landing page for electrical design companies:**
  - what the app does, in one sentence;
  - real screenshots and a short clip ("draw the schematic once; terminals, cables, BOM and cabinet
    follow");
  - "free and open source, runs on your computer, your files stay yours";
  - export formats;
  - download buttons per OS;
  - an honest comparison with the tools they know, with no claim we cannot back.
- **"For companies" page:** support, training and custom features, with a contact link.
- **Also:** docs, changelog, GitHub link.
- **SEO pages generated from the library:** one page per IEC symbol and device type, plus short guides
  (IEC 81346 designations explained, wire numbering schemes, choosing a cable cross-section, with
  sources).
- **Performance and privacy:** fast pages, no tracking without consent.

## Open source

- Apache-2.0 LICENSE and NOTICE; THIRD_PARTY_LICENSES generated at build time.
- CONTRIBUTING with DCO sign-off, CODE_OF_CONDUCT, SECURITY.md.
- Issue and PR templates, good-first-issue labels.
- A "contribute in 30 minutes" section in the README.

## Conventions

- TypeScript strict; no `any` in `/shared` or `/app/main`.
- Every user-facing string goes through `t()` with an Italian entry, enforced by a test.
- Connectivity, numbering, reports and checks have unit tests; every bug fix gets a test.
- Secrets never go in the renderer or in git.
- UI text is for professionals, in plain words.

## Decisions already made (do not ask again)

- **Name:** CablePilot (repo `mojeee/cablepilot`, npm name `cablepilot`). Public on GitHub from day one.
- **Copyright holder:** Mojtaba Amini (LICENSE, NOTICE, title-block defaults, About box). Do not publish
  any email address. Companies get in touch through GitHub Discussions and issues; the "For companies"
  page links there.
- **Website:** https://cablepilot.agentflowbind.com, a static site built into `/site` like BoardPilot's
  (Cloudflare Pages serves it; I will connect the repo myself). Use that URL for canonical links,
  sitemap and Open Graph tags.
- **AI models:** Anthropic default `claude-sonnet-5-5`, fast model `claude-haiku-4-5-20251001`; OpenAI and
  Gemini through `fetch` like BoardPilot. No API key is available yet: build and test the assistant
  against a fake provider; a test with a real key comes later and must be skipped when no key is set.
- **Theme:** dark UI like BoardPilot, with a light theme; the drawing canvas can be dark or white, and
  print preview is always white.
- **Symbol standard:** IEC 60617 by default; NFPA 79/ANSI symbols as an option from M1 (a project
  setting), with the same devices behind both.
- **Sample projects:** a conveyor with a direct-on-line motor starter, an emergency-stop circuit and a
  small PLC; a pump-station panel with two pumps (star-delta starter) and a cabinet layout.
- **Scope:** build every milestone, M0 to M8, one after the other, without stopping for review. End
  each milestone as described (runs, tests pass, sample works, CHANGELOG, one commit) and push it.
- **When you would have to ask me:** if the question is only a choice between reasonable options,
  choose the conservative one, write it with your reasons in `docs/decisions.md` and carry on. Small,
  well-maintained dependencies under MIT, Apache-2.0, BSD or ISC need no approval; list each one with
  its reason in `docs/decisions.md`. Stop and ask only for a GPL or AGPL licence, a paid service,
  anything that writes outside the repository, or anything that publishes (releases, tags, posts).
- **Keep me informed:** after each milestone, add a short entry to `docs/progress.md` (what works, what
  is left, anything I must do by hand).

## Start here

1. Write CLAUDE.md from this brief and the decisions above (product, users, rules, stack, structure,
   conventions) and docs/roadmap.md with the milestones as checklists.
2. Build M0, then continue through M8 as described in the decisions above.
