# CablePilot

[![CI](https://github.com/mojeee/cablepilot/actions/workflows/ci.yml/badge.svg)](https://github.com/mojeee/cablepilot/actions/workflows/ci.yml)
[![Licence: Apache-2.0](https://img.shields.io/badge/licence-Apache--2.0-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-cablepilot.agentflowbind.com-4da3ff.svg)](https://cablepilot.agentflowbind.com)

Open-source electrical design for machine builders, control-panel builders, system integrators and
automation engineers: multi-page schematics, live terminal, cable and wire lists and BOM, a cabinet
layout to scale, and production drawing sets. Free, local-first, no account, no cloud. Your files
stay yours.

Website: https://cablepilot.agentflowbind.com · Licence: Apache-2.0 · Status: in development,
milestone by milestone (see [docs/roadmap.md](docs/roadmap.md) and [docs/progress.md](docs/progress.md)).

## What it will do

- **Draw the schematic once.** IEC 60617 symbols, IEC 81346 designations, cross-references and
  automatic wire numbers. Reports and the cabinet layout are generated from the schematic and update
  live.
- **Production drawing sets.** Cover sheet with revisions, data sheets, legends, terminal and cable
  pages, nameplates, a dimensioned layout and a BOM, in your own frame and title block.
- **Checks on every change.** An electrical rule check with one-click fixes.
- **Honest, optional AI.** An assistant with your own API key that proposes changes as a preview you
  accept or reject, and cites its sources. The app is fully usable without it.

Done so far: **M0, the scaffold** (the app window with its main layout, themes, English and Italian,
CI and the website skeleton). The schematic editor is next (M1).

## Run it

```bash
npm install
npm run dev
```

Other commands: `npm run typecheck`, `npm test`, `npm run check:licenses`, `npm run check:library`,
`npm run build`, `npm run test:e2e`, `npm run build:site`. See [CLAUDE.md](CLAUDE.md).

## Contribute in 30 minutes

1. Fork the repository and run `npm install` and `npm run dev` (5 minutes).
2. Pick something small:
   - fix or add an Italian text in `shared/i18n/it/app.ts` (the test in `tests/i18n.test.ts` tells you
     which are missing);
   - add a library data file under `library/` with its `source` and run `npm run check:library`;
   - add a unit test for a function in `shared/`;
   - improve a text in `scripts/site/texts.mjs` and run `npm run build:site`.
3. Run `npm run typecheck && npm test` (2 minutes).
4. Commit with `git commit -s` (the DCO sign-off, see [CONTRIBUTING.md](CONTRIBUTING.md)) and open a
   pull request. Issues labelled `good first issue` are a good place to start.

Questions, training and custom features for companies: GitHub Discussions.

## Folders

`app/main` (Electron main), `app/preload` (typed API), `app/renderer` (UI), `shared` (types, i18n,
later connectivity, file format, reports, checks), `library` (data), `samples`, `docs`, `site` (the
generated website), `scripts`, `tests`, `e2e`.

## Licence

Apache-2.0. Copyright Mojtaba Amini. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party
licences are listed in `THIRD_PARTY_LICENSES.md`, generated at build time.
