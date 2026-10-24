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
  - PDF drawing sets and exports for the workshop, in the company's own frame and title block, with
    revisions and a cover sheet the customer signs off (rule 11).
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
   - Conductor identification by colour and alphanumeric code: IEC 60445; colour abbreviations
     (BK, BU, RD, GY, OG, GNYE…): IEC 60757.
   - Drawing sheets and title blocks: ISO 5457 and ISO 7200; lettering: ISO 3098.
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
   protection, terminals, PLC I/O cards, cables, enclosures, and for DC and power-electronics panels:
   batteries, diodes, rectifier and inverter modules, DC/DC converters, hall-effect current sensors, EMI
   filters, transformers with vector group, phase-monitoring relays, HMI panels, network switches, RJ45
   sockets), with dimensions and electrical data and their sources. Users import manufacturer data from files they are licensed to use. We never scrape or
   ship manufacturer catalogues without permission.
10. **Demo mode.** Sample projects ship with the app, for example a conveyor with a motor starter and a
    PLC, and a pump-station panel, so every feature can be shown and tested without user files.
11. **Production-ready drawing sets.** A finished project must print as a complete set that a workshop
    builds from and a customer signs off, with nothing drawn by hand afterwards: cover sheet with sheet
    index and revision status, project data sheets, legends, single-line and multi-line diagrams,
    terminal and cable pages, nameplates, a dimensioned cabinet layout and a BOM, all in the company's
    own frame, title block and drawing style. `docs/reference-drawing-check.md` lists what a real set
    of this kind contains; every row must be possible before release 1.
12. **Sizing from the schematic, parts from the warehouse.** The app sizes cables and components and
    proposes parts the company actually has in stock; the user only selects and confirms.
    - **Sizing** is computed, never guessed, from data in the project (load or motor rating, voltage,
      power factor, supply, prospective short-circuit current, installation method, ambient
      temperature, grouping, cable length), with sources: cable current-carrying capacity and
      correction factors (IEC 60364-5-52), overcurrent protection and coordination Ib ≤ In ≤ Iz and
      I2 ≤ 1.45 Iz (IEC 60364-4-43), voltage drop (IEC 60364-5-52), circuit-breakers (IEC 60947-2),
      contactors and overload relays with their utilisation category (IEC 60947-4-1). Each result shows
      its requirement ("In ≥ 16 A, curve D, 3 poles, Icu ≥ 10 kA"; "cable ≥ 2.5 mm², method B1,
      30 °C"), its assumptions, and says it does not replace the engineer's verification.
    - **The warehouse** is the company's own stock list, imported from CSV or XLSX exported by their
      ERP or warehouse system (a column-mapping wizard, saved per company; refresh from a file or a
      watched folder): part code, manufacturer, description, quantity on hand, reserved, location,
      unit. Stock items are linked to library parts, which carry the technical data sizing needs; an
      item without that data is shown as "data missing", never suggested for a rating it cannot prove.
      Live connections to an ERP come later and are decided with the owner.
    - **Suggestions** list only parts that meet the requirement, ranked: in stock with enough quantity
      first, then in stock but short, then not in stock. Each row shows the warehouse, location and the
      quantity **available for this project**: on hand − reserved − what this project already uses
      (quantity per device × units to build; cable in metres from the wire lengths). Picking one and
      confirming is one undoable command; nothing changes without the user's confirmation. "Size the
      whole project" shows every proposal in one review table to accept line by line or all at once.
    - **Quantities stay correct:** the BOM shows on hand, available, short and location per row;
      shortages appear in the message list; the stock date is shown and an old stock list is flagged;
      a picking list (CSV/XLSX) is exported for the warehouse. When the stock list is refreshed, parts
      the project uses that are no longer available are flagged.
    - The AI assistant (M7) uses the same sizing engine and stock data; it never invents a rating.

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
  - single-line (overview) pages, with n-conductor tick marks on lines, next to the multi-line pages;
  - project data pages: forms laid out on a page (text fields, tick boxes, tables) filled from project
    and assembly properties, e.g. rated voltages, Icw, IP degree, form of segregation (IEC 61439);
  - page frames with column and row zones; zone labels configurable (e.g. skip I and O), sheet sizes
    A4–A0 per ISO 5457;
  - company templates, stored as data in the project and reusable across projects: frame, title block
    (logo image, drawing number, order number, client, product, sheet title, drawn / checked /
    approved, issue date, sheet / next sheet / total, revision), margin text such as a copyright notice;
    fields fill in automatically from project and page properties;
  - drawing styles: colours per element type (e.g. designations and wire numbers in red), line weights,
    fonts; print preview always on white;
  - drawing language: a project setting separate from the UI language, used for report headers, legends
    and title-block labels; device and function texts can hold English and Italian;
  - an IEC 60617 symbol library as data: graphics, connection points, function type;
  - an in-app symbol editor, so companies draw their own symbols and save them to a company library
    (still plain data files, checked by the same validation script);
  - place, move, rotate and mirror;
  - orthogonal wires with auto-connect and junctions;
  - potentials (L1/L2/L3/N/PE, L+/L−, 24 V DC, 0 V, 110 V DC);
  - IEC 81346 designations with automatic numbering, including location (+DS, +MO…);
  - free annotation: text (rotated, multi-line), lines, rectangles, dashed outlines, tables, images
    (PNG, JPEG, SVG) such as device photos, and our own warning-sign graphics;
  - undo, save, PDF export of pages.
- **M2 Devices and cross-references:**
  - a device is one or more symbols (coil and contacts, multi-pole breakers), with main and auxiliary
    functions;
  - one device, several representations: the same -QF1 on a single-line page and on a multi-line page
    is one device, counted once in the BOM and cross-referenced both ways;
  - contact images under coils, with an optional note on the shown state (e.g. "contacts shown with
    relay in alarm");
  - cross-references with a configurable format: page.column, or page-column-row like `08-E3`;
  - interruption points between pages, carrying a signal or potential name (e.g. IOUT, REF−);
  - black boxes, and connectors and plugs with numbered, named pins (board headers, plug/socket pairs),
    shown as pin-level connection points;
  - nested assemblies: a device mounted on or inside another (a contactor on a switching plate, sensors
    in a block), drawn with a dashed outline and grouped in the BOM;
  - macros: a group of symbols, black boxes and wires saved to the company library and placed again in
    other projects (e.g. a company's standard boards);
  - parts assigned from the library; several parts per device (a module plus its capacitors), and
    project-level parts with no designation (mounting plate, wiring kit);
  - BOM with configurable columns: designation, position (page-column), quantity, part code,
    description, manufacturer, user fields such as make-or-buy type and notes; quantity multiplied by
    the number of units to build.
- **M3 Wires and reports:**
  - automatic wire numbering (potential-based, page-column or sequential), with a configurable pattern
    such as counter plus potential suffix (`020L+`, `005U`, `030FL`);
  - wire types (e.g. a single-core type with its cross-section and colour) and a company wire-class table
    (function → colour, cross-section, type, suffix); conductors drawn in their colour on the canvas;
    one label for a bundle of wires ("10 mm² BK");
  - terminals and terminal strips, generated from the schematic;
  - cables with cores, including core colours (WH/YE/GN/BN), flat ribbon cables and patch cables
    (RJ45) between connectors;
  - reports, all live: terminal diagrams (destination, function text, terminal part, strip length),
    cable list, wire list (from, to, cross-section, colour, type), connector pin lists, BOM, contents;
  - generated pages: symbol legend (only the symbols the project uses), conductor colour and wire-suffix
    tables, tightening-torque table for the terminals used (from library data, with sources);
  - nameplates: label text per device (e.g. "-QF1 / AC input / auxiliary supply"), drawn on a page and
    exported as a list;
  - exports: PDF drawing set, CSV and XLSX, wire-marker, terminal-marker and nameplate lists;
  - DXF import and export of pages.
- **M4 Checks and revisions:**
  - the electrical rule check (rule 5), with the warnings banner and one-click fixes;
  - issue status of the set: for proposal, for approval, for construction, as built;
  - issue a revision (number, date, description, drawn / checked / approved); the app works out which
    pages changed since the last issued revision;
  - a generated cover sheet: sheet index with the revision of every sheet, the revision list, the issue
    status and a customer approval and signature block;
  - compare two revisions: changed pages highlighted, and a list of added, removed and changed devices,
    wires and parts.
- **M5 PLC:**
  - PLC racks and I/O cards as devices;
  - an I/O assignment overview;
  - tag lists exported and imported in the formats TIA Portal and CODESYS accept. Verify each format
    against the vendor documentation before you ship it, and cite that documentation in the code.
- **M6 part 1, Sizing and warehouse** (rule 12; built before the cabinet layout so the layout places
  the parts actually chosen):
  - load and feeder data on devices (motor kW and current from the nameplate, load current, cos φ),
    project supply data (voltage, prospective short-circuit current, ambient temperature, installation
    method, grouping), cable lengths entered by hand until the M6 layout estimates them;
  - the sizing engine in `/shared` as pure functions, every table value with its source, unverified
    values in `docs/to-verify.md`;
  - warehouse import (CSV/XLSX, column mapping, refresh), linking stock items to library parts, and a
    generic sample stock file for the samples and the demo;
  - a suggestion panel per device and per conductor, and the project-wide review table; confirm is an
    undoable command;
  - BOM stock columns, shortages in the message list, picking-list export;
  - tests: sizing worked examples, availability arithmetic (units to build, metres of cable, reserved
    stock), import mapping; e2e: import stock, size a motor feeder, confirm, see the BOM quantities.
- **M6 part 2, CAD workspace with the AI inside** (built before the cabinet layout, so the layout and
  every later feature live in it): a workspace that AutoCAD and AutoCAD Electrical users feel at home
  in within minutes. Go as close to AutoCAD's way of working as the law allows: the same arrangement
  (ribbon on top, drawing area in the middle, command line and status bar at the bottom, palettes at
  the sides), the same command names, aliases, keys, prompts and interactions, a dark drawing area
  with crosshair cursor and pickbox. Only Autodesk's protected elements stay out: their logos, icon
  artwork, product names and trademarks, and pixel copies of their screens. Our icons and styling are
  drawn by us in the same spirit.
  - **Ribbon:** tabbed, grouped tools (Home, Insert, Wires, Reports, PLC, Layout, View), collapsible;
  - **Command line** at the bottom: history, autocomplete, the aliases CAD users type (L, PL, REC, C,
    M, CO, RO, MI, E, TR, EX, O, Z/ZE, U, PAN, LA, DI…) plus ours (symbol insert, wire, number wires,
    report, check); options shown in brackets; Enter or Space repeats the last command, Esc cancels;
  - **Drafting aids** in a status bar: grid (F7), ortho (F8), snap (F9), object snap (F3) with modes
    (endpoint, midpoint, connection point, intersection, perpendicular, nearest), polar tracking
    (F10); dynamic input next to the cursor showing length and angle and accepting typed values and
    relative coordinates (`@100,0`, `@50<90`);
  - **Selection like CAD:** window (left to right) and crossing (right to left), Shift to remove,
    grips to move and stretch, right-click menus with "repeat last command";
  - **Layers:** on/off, lock, colour, line type, with the drawing styles mapped to layers;
  - **Dockable, resizable panels** (pages, symbols and devices, properties, layers, messages, AI chat),
    layout saved per user; full-screen canvas toggle;
  - **The AI inside:**
    - an AI chat panel docked next to the canvas that knows the project, the current page and the
      selection;
    - the command line is smart: anything that is not a command goes to the assistant ("add a
      star-delta starter for a 7.5 kW motor on page 5"), and the answer comes back as a highlighted
      preview to accept or reject;
    - context hints, e.g. after placing a coil: "add its contacts?";
    - until M7 connects real providers, the panel works with the fake provider and says that an API
      key is needed. Rule 6 applies throughout: proposals only, sources on every claim, the app fully
      usable without AI;
  - **Tests:** e2e for command-line drawing (`L`, typed coordinates, ortho), snaps, window vs crossing
    selection, a docked-panel layout surviving a restart, and a chat proposal accepted and undone (fake
    provider).
- **M6 part 3, Cabinet layout:** drawn by the user in the app, with the same CAD workspace tools
  (snaps, typed coordinates, grips, layers) as the schematic:
  - enclosure and mounting plate from the library, DIN rails and wire ducts, drawn, moved and
    resized by the user;
  - devices placed from the BOM at real size, in a 2D front view to scale; a device's outline can come
    from the library or from an imported DXF, SVG or image; devices snap to rails, align and
    distribute, and a device not yet placed is listed so nothing is forgotten;
  - a suggested layout that the user then modifies freely:
    - from the BOM and the schematic it proposes the enclosure and plate size (with the company's
      spare-space percentage), rails and ducts, and a placement of every device: power at the top and
      control below, devices grouped by function and by the schematic's order, terminals near the
      cable entry, door devices on the door, clearances and no-mount zones respected, duct fill kept
      under its limit;
    - shown as a preview to accept, then edited with the normal tools; items the user moved or locked
      stay put when the suggestion is run again on the rest;
    - every rule it applied is listed (and sourced where a standard or a manufacturer clearance
      applies), and the AI assistant can explain or adjust it on request (rule 6);
  - layout templates: a finished layout (enclosure, plate, rails, ducts, standard device groups)
    saved to the company library and loaded into new projects;
  - layout exchange with an ERP or another system, in a documented, versioned format:
    - export and import the layout as JSON and CSV (per item: designation, part code, enclosure,
      plate or door, rail, x, y, z, rotation, size) and as DXF (2D views), and later STEP (3D);
    - enclosures, plates and device dimensions can come from the ERP item master through the same
      CSV/XLSX import and mapping as the warehouse (rule 12);
    - import is previewed and undoable; exchange runs through files or a watched folder, and a live
      connection to a specific ERP is decided with the owner;
  - a side view showing device depths;
  - dimension lines, notes, hatched no-mount zones, covers, door-mounted devices;
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
  - a launch checklist, which includes printing the DC battery-charger sample as a full drawing set and
    ticking every row of `docs/reference-drawing-check.md`.
- **M9 and later, phase 2 electronics:**
  - electronic schematic capture with IEC and ANSI symbols, nets and an electronics ERC;
  - KiCad schematic, symbol and footprint import and export;
  - a 3D board from the footprints;
  - BOM.

  Decide on PCB layout together with me after M9.
- **After release 1, decide with me:** importing an existing drawing set (PDF or DXF made in another
  tool) as an editable, connected project, e.g. with AI recognising symbols, designations and wires
  and proposing the result as a preview. Until then a DXF page can be imported as plain graphics.

## Website (generated from the repo into /site, static, English and Italian)

Build it the way MechPilot (`mojeee/mechpilot`) builds its site: read its `docs/website.md`,
`scripts/build-site.mjs`, `scripts/check-site.mjs`, `scripts/site/` and `e2e/screenshots.e2e.ts` as
the reference, and write CablePilot's own `docs/website.md` in the same shape. Do not copy its texts.

- **Landing page for electrical design companies,** in this order:
  - hero: one-sentence promise ("draw the schematic once; terminals, cables, BOM and cabinet
    follow"), "free and open source, runs on your computer, your files stay yours", Download and
    "Watch the demo" buttons, and a status line (version, milestones done, "first release is not out
    yet");
  - "In the app today": one block per feature area (schematic, devices and cross-references, wires and
    reports, checks and revisions, PLC, cabinet layout), each with an Available / Planned (Mx) tag,
    the standards it follows as small tags (IEC 60617, 81346, 61082, 60204-1, 60445…), and real
    screenshots in dark and light with a theme switch that needs no script;
  - "A complete drawing set": the pages of the battery-charger sample shown as a strip of thumbnails
    (cover with revisions, single-line, multi-line, terminals, layout, BOM): what the workshop gets;
  - "AI inside, you decide": example prompts and an illustrated proposal with a source on every value
    (project, standard and clause, library, "suggestion"), your own key, nothing sent elsewhere;
  - "Why CablePilot": local-first, open format, sourced values, open source;
  - an honest comparison table with the tools they know, with no claim we cannot back;
  - export formats, download per OS, and a link to "For companies".
- **Demo page** (`/demo/`, `/it/demo/`): built from `docs/demo.md` and its Italian file: numbered steps
  with the prompts as chat bubbles, one screenshot per step, and a screen recording (WebM and MP4)
  on top, or a "recording in progress" note until it exists.
- **The recorded demo must impress an electrical engineer in the first 30 seconds.** It is the most
  important thing on the site: a short loop of it plays muted in the landing-page hero (`<video
  autoplay muted loop playsinline>` with a poster image, which needs no script), and the full version
  is on the demo page.
  - **Story (about 90 seconds, captions in English and Italian, no voice needed):**
    1. open the battery-charger sample: the cover sheet, then flick through the full drawing set;
    2. place a motor starter from the library: designations, wire numbers and cross-references
       appear by themselves;
    3. change one device on the schematic and watch the terminal diagram, the wire list, the BOM and
       the cabinet layout update live, side by side;
    4. the check finds an undersized cable and a duplicate designation; fix both with one click;
    5. ask the assistant "add a star-delta starter for a 7.5 kW motor on page 5": the proposal
       appears highlighted with its sources, then Accept;
    6. turn the cabinet in 3D, then issue revision 1: the cover sheet marks the changed pages;
    7. export the PDF drawing set and the XLSX lists; end on the printed set and "free, open source,
       your files stay yours".
  - **Recorded, not edited by hand:** a Playwright script drives the real built app through the story
    with a fake AI provider. It records at 1920×1080, 60 fps, with smooth cursor moves, zoom-ins on
    the area that changes and short pauses so a viewer can read. The same script gives the hero loop
    (about 15 seconds: steps 3 and 6) and the step screenshots, so the demo is recorded again whenever
    the UI changes (`npm run record:demo`).
  - **Size and quality:** WebM (VP9) and MP4 (H.264), under 8 MB for the full version and 2 MB for
    the hero loop; captions as WebVTT tracks; a poster frame for each; the check script fails if
    any of these is missing once the recording exists.
- **"For companies" page:** support, training and custom features (company symbol libraries, title
  blocks and macros, data migration), why it is safe to build on (Apache-2.0, open format, no
  vendor lock-in), and "get in touch" through GitHub Discussions.
- **Also:** docs (getting started, file format, numbering, PDF and DXF), changelog from
  `CHANGELOG.md`, GitHub link, 404.
- **SEO pages generated from the library:** one page per IEC symbol and device type, standards tables
  (conductor colours IEC 60445/60204-1, cable current-carrying capacity IEC 60364-5-52, terminal
  tightening torques), each showing its source and verification status, plus short guides (IEC 81346
  designations explained, wire numbering schemes, choosing a cable cross-section, reading a terminal
  diagram), with sources. Italian URLs under `/it/` (e.g. `/it/norme/`, `/it/guide/`).
- **Rules the build enforces** (same as MechPilot):
  - every page in English and Italian; a missing Italian text fails the build;
  - values come from the library data and are never typed into pages;
  - Available / Planned tags, the status line and the AI wording are derived from the ticked boxes
    in `docs/roadmap.md`, so a rebuild after a milestone updates the site; the assistant is described
    as shipped only when M7 is ticked;
  - screenshots are taken from the real app by a Playwright script, never retouched;
  - deterministic output (no dates, stable order), committed to `/site`;
  - a check script: every internal link, image and anchor resolves; every page has `lang`, one
    `<title>`, one `<h1>`, a description, a canonical link and hreflang pairs; the sitemap lists only
    existing pages; no `<script>`, no inline event handler, no email address, nothing loaded from
    another origin.
- **Performance and privacy:** no JavaScript, no cookies, no web fonts, no tracking, no third-party
  requests; one stylesheet with colour tokens (text passes WCAG AA, motion respects reduced-motion);
  `_headers` with a strict Content Security Policy and long caching for hashed assets; `_redirects`
  with `/download` → latest GitHub release and `/discussions` → GitHub Discussions.
- **Hosting:** Cloudflare Pages serves the committed `/site` with no build step. `docs/website.md`
  ends with the owner's one-time setup (connect the repo, output directory `site`, custom domain
  `cablepilot.agentflowbind.com`) and the curl commands to check the headers after a deploy.

## Open source

- Apache-2.0 LICENSE and NOTICE; THIRD_PARTY_LICENSES generated at build time.
- CONTRIBUTING with DCO sign-off, CODE_OF_CONDUCT, SECURITY.md.
- Issue and PR templates, good-first-issue labels.
- A "contribute in 30 minutes" section in the README.

## Conventions

- TypeScript strict; no `any` in `/shared` or `/app/main`.
- Every user-facing string goes through `t()` with an Italian entry, enforced by a test. Text printed
  on drawings (report headers, legends, title-block labels) follows the project's drawing language,
  not the UI language.
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
  small PLC; a pump-station panel with two pumps (star-delta starter) and a cabinet layout; a 110 V DC
  battery-charger panel (3-phase input, two rectifier modules, battery string, switching block, PLC
  interface, alarm relays, HMI) with Italian drawing texts, built as a complete production set as
  described in rule 11. Use generic parts only; never copy the reference drawing's company, numbers or
  part codes.
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
