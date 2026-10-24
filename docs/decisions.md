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

The full transitive list, with licences, is in `THIRD_PARTY_LICENSES.md` after `npm run build`.
