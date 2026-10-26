# The website

https://cablepilot.agentflowbind.com is a static site generated from this repository into `site/`
and served as it is by Cloudflare Pages. English pages are at `/`, Italian pages at `/it/`. There is
no JavaScript on any page, no cookie, no web font, no tracking and no request to a third party. One
stylesheet with colour tokens (`scripts/site/style.css`; text pairs pass WCAG AA; motion only when
the visitor has not asked for less). The approach is the same as MechPilot's site; the texts are
CablePilot's own.

## What is in it

The design follows BoardPilot's site (the owner's other product): dark throughout, a sticky blurred navigation bar
with the sections, an EN/IT switch, the GitHub link and Download; a centred hero; a strip of facts; cards with icons;
an FAQ; a footer with Product, Guides and Community columns. Fonts stay the system stack (BoardPilot loads web fonts;
this site loads nothing from a third party).

| Pages | Built from |
| --- | --- |
| Landing page (`/`, `/it/`) | `scripts/site/index.template.html` |
| Guides (`/docs/`, `/docs/getting-started/`, `/docs/numbering/`, `/docs/file-format/` and `/it/docs/...`) | `docs/<slug>.md` in English, `scripts/site/docs.it/<slug>.md` in Italian (with the hash of the English text it translates; a newer English text is a warning) |
| For companies (`/companies/`, `/it/aziende/`) | `scripts/site/companies.template.html` |
| Demo (`/demo/`, `/it/demo/`) | `docs/demo.md` and `scripts/site/demo.it.md` (steps), the recording in `site/video/` |
| 404, `robots.txt`, `sitemap.xml`, `site.webmanifest`, `_headers`, `_redirects` | `scripts/build-site.mjs` |

The landing page has, in order: the hero (eyebrow, headline, what the app does, the actions, the status line, feature
chips, the hero video loop in a window frame); a strip of facts counted from the repository (symbols, parts, reports,
samples, languages); the short videos; "In the app today" (one card per feature area with an Available / Planned (Mx)
tag and the standards, and a dark/light screenshot switch made with radio inputs and CSS, no script); how it works;
the drawing set; the assistant; the principles; the comparison; the demo; the guides; the FAQ; download.

**Download.** Until every box of `## M8 Release 1` is ticked, the buttons say so honestly (watch the demo, follow the
releases on GitHub). Once it is, they link straight to the installers on the latest release
(`releases/latest/download/CablePilot-mac-arm64.dmg`, `-mac-x64.dmg`, `-win-x64.exe`, `-linux-x86_64.AppImage`).

## Search engines

- **Titles and descriptions** say what CablePilot is in the words people search for (electrical CAD, control panels,
  IEC schematics, terminal and cable lists), in both languages; every page has its own.
- **Structured data** (schema.org JSON-LD, never run: `<script type="application/ld+json">` is the only script
  `scripts/check-site.mjs` allows): `SoftwareApplication`, `WebSite` and `FAQPage` on the landing page,
  `TechArticle` and `BreadcrumbList` on the guides.
- **Social cards:** `site/img/og.png` and `og-it.png` (1200 x 630: the mark, the headline and a real screenshot) with
  Open Graph and Twitter tags; touch and manifest icons. `npm run icon` renders them and the app icon with
  Playwright's Chromium (`scripts/make-icon.mjs`); run it again after `npm run screenshots`.
- **Language pairs:** canonical links, `hreflang` pairs and `x-default` on every page; the sitemap lists both
  languages of every page with their alternates.
- **Guides as pages:** the user guides are real HTML pages with headings and anchors, linked from the navigation, the
  landing page and the footer.
- Images carry `width`, `height`, `alt`, `loading="lazy"` and `decoding="async"`; videos load nothing until played.

## Rules the build enforces

- **Italian for every text.** Texts live in `scripts/site/texts.mjs` with `en` and `it` side by side;
  templates use `{{t:key}}`. A missing key or Italian text fails the build with the list.
- **Values from the data, never typed.** Numbers from standards are never typed into pages; they come
  from `library/` once pages show them.
- **Status from the roadmap.** The status line, the Available / Planned (Mx) tags and the "first
  release is not out yet" note are derived from the ticked boxes in `docs/roadmap.md` (a milestone is
  done when every box under its `## M<n>` headings is ticked). The assistant is described as shipped
  only when every box under `## M7-AI Assistant` is ticked; the build fails if that heading
  disappears. Template branches are written `<!-- if ai --> … <!-- else --> … <!-- end -->`; both
  are translated on every build.
- **Screenshots from the real app** (Playwright script, M8), never retouched. Until then the pages
  show a placeholder.
- **The recorded demo.** `npm run record:demo` builds the app, records the story with Playwright
  (`e2e/demo.e2e.ts`, 1920 x 1080, DC battery-charger sample, a visible pointer, zoom-ins, cover matrix, check banner and fix, PLC I/O window;
  nothing is faked or edited), encodes it (`scripts/demo-video.mjs`, ffmpeg) and rebuilds the site. The
  captions' texts are in `e2e/demo-captions.json` (English and Italian) and are timed from the moments the
  script marks. Files: `site/video/demo.webm` (VP9) and `demo.mp4` (H.264, faststart), the 15 s muted loop (from the wire numbering)
  `hero.webm` and `hero.mp4`, captions `demo.en.vtt` and `demo.it.vtt`; posters `site/img/hero-poster.png`
  and `demo-poster.png`, and one frame per step `site/img/demo-1.png` ... `demo-5.png`. The landing-page hero
  plays the loop (`<video autoplay muted loop playsinline poster=...>`, no script) and "Watch the demo" opens
  the demo page: the full video with both caption tracks on top, then the steps of `docs/demo.md`
  (Italian: `scripts/site/demo.it.md`, same sections; the build fails when the number of steps differs and
  warns when the English text changed since the translation, update its `source:` hash). Until
  `hero.*` / `demo.*` exist the pages show a "recording in progress" slot. Once any recording file exists,
  `scripts/check-site.mjs` fails if one of the files is missing or over its budget (8 MB demo, 2 MB hero
  loop). `_headers` caches `/video/*` and the CSP keeps `media-src 'self'`. Re-record whenever the interface
  changes; needs ffmpeg (`brew install ffmpeg`). Timing: at the start of every recording the window turns magenta for
  a moment (`e2e/recorder.ts`, `sync()`); `scripts/video-sync.mjs` finds that frame, and every mark (captions, trims,
  step frames, posters) is placed from it. Playwright takes a varying time to finish a recording, so the end of the
  file is not a reliable anchor.
- **The short videos.** `npm run record:clips` builds the app and records one short clip per feature area
  (schematic, wire numbers and reports, checks and revisions, PLC, the drawing set, sizing, the CAD workspace,
  the cabinet layout, the assistant, the ERP link) in English and Italian, the way BoardPilot's landing page
  does. Each clip is recorded from the real app on a sample project with the UI in its language
  (`e2e/clips.e2e.ts`, 1920 x 1080, a visible pointer); the captions are drawn on top of the window while it
  records (`e2e/recorder.ts`), so they are part of the picture and work with the sound off. Titles,
  descriptions and captions are in `e2e/clips.json`. `scripts/clips-video.mjs` trims and encodes them to
  `site/video/clip-<id>-<lang>.mp4` (1280 x 720, H.264, faststart, no audio) with a `.jpg` poster, and the
  landing page shows them in a "See every feature in half a minute" grid (`<video controls muted loop
  playsinline preload="none">`, no script), in the page's language. `CP_CLIPS=erp,ai` records some clips
  only, `CP_CLIPS_LANG=it` one language. `scripts/check-site.mjs` fails when a clip has no poster or is over
  4 MB. The assistant clip uses a test key and the scripted stand-in; the page says so.
- **Deterministic.** No dates, stable order; two runs give identical bytes. Everything in `site/`
  except `site/img/` and `site/video/` is deleted and written again on every build.
- **Checked.** After writing, the build runs `scripts/check-site.mjs`: every internal link, image
  and anchor resolves; every page has `lang`, one `<title>`, one `<h1>`, a description and a
  canonical link; hreflang pairs point at each other; the sitemap lists only pages that exist; no
  `<script>`, no inline event handler, no email address, nothing loaded from another origin.

## Build and check

```bash
npm run build:site     # node scripts/build-site.mjs (runs the check too)
npm run check:site     # the check alone
```

Commit `site/` together with the change that caused it. CI runs `npm run build:site` and then
`git diff --exit-code -- site`: it fails when the committed site is not what the sources produce.
Rebuild after editing `scripts/site/*`, `docs/roadmap.md`, `CHANGELOG.md`, `library/` or the version
in `package.json` (the version is shown in the footer and the status line).

## Cloudflare Pages: one-time setup (owner)

The site needs no build step on Cloudflare: it serves the committed `site/` folder.

1. In the Cloudflare dashboard go to **Workers & Pages** > **Create** > **Pages** > **Connect to Git**.
2. Authorise the Cloudflare GitHub app for the `mojeee/cablepilot` repository only, and select it.
3. Build settings: project name `cablepilot`, production branch `main`, framework preset None, build
   command empty, **build output directory `site`**, root directory `/`, no environment variables.
4. **Save and Deploy.** Pushes to `main` deploy production; other branches get preview URLs (turn
   those off under Settings > Builds & deployments if unwanted).
5. Custom domain: **Custom domains** > **Set up a custom domain** > `cablepilot.agentflowbind.com`.
   If `agentflowbind.com` is a zone in the same Cloudflare account the DNS record is created for you;
   otherwise add `CNAME cablepilot -> cablepilot.pages.dev` at your DNS provider and wait for the
   domain to show **Active**.
6. Keep **Always Use HTTPS** on; leave Rocket Loader, Email Address Obfuscation and anything that
   injects scripts off.

### What `_headers` and `_redirects` do

- `site/_headers`: on every path `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` that turns off camera,
  microphone and geolocation, and a `Content-Security-Policy` that allows only this origin
  (`default-src 'self'`, images also as `data:`, `media-src 'self'` for the demo video, no scripts,
  no inline styles, no framing). Long immutable caching for `/style.css`, `/img/*` and `/video/*`.
- `site/_redirects`: `/download` goes to the latest GitHub release and `/discussions` to GitHub
  Discussions, both temporary (302).

### Check after a deploy

```bash
curl -sI https://cablepilot.agentflowbind.com/ | grep -iE 'content-security|x-frame|x-content|referrer|permissions'
curl -sI "https://cablepilot.agentflowbind.com/style.css?v=x" | grep -i cache-control
curl -sI https://cablepilot.agentflowbind.com/download | grep -iE '^(HTTP|location)'
curl -s -o /dev/null -w '%{http_code}\n' https://cablepilot.agentflowbind.com/does-not-exist/   # 404
curl -s https://cablepilot.agentflowbind.com/sitemap.xml | head -5
```

On Windows PowerShell use `curl.exe`. In a browser's developer tools the Console should show no CSP
error on any page.
