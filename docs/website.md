# The website

https://cablepilot.agentflowbind.com is a static site generated from this repository into `site/`
and served as it is by Cloudflare Pages. English pages are at `/`, Italian pages at `/it/`. There is
no JavaScript on any page, no cookie, no web font, no tracking and no request to a third party. One
stylesheet with colour tokens (`scripts/site/style.css`; text pairs pass WCAG AA; motion only when
the visitor has not asked for less). The approach is the same as MechPilot's site; the texts are
CablePilot's own.

## What is in it (M0 skeleton)

| Pages | Built from |
| --- | --- |
| Landing page (`/`, `/it/`) | `scripts/site/index.template.html` |
| For companies (`/companies/`, `/it/aziende/`) | `scripts/site/companies.template.html` |
| 404, `robots.txt`, `sitemap.xml`, `_headers`, `_redirects` | `scripts/build-site.mjs` |

The landing page has, in order: hero (promise, "free and open source, runs on your computer, your
files stay yours", Download and Watch the demo, a status line, a slot for the hero video loop); "In
the app today" (one block per feature area with an Available / Planned (Mx) tag, standards tags, and
a dark/light screenshot switch made with radio inputs and CSS, no script); "A complete drawing set"
(thumbnail strip); "AI inside, you decide"; "Why CablePilot"; the comparison table; the demo slot;
formats and download per OS with a link to For companies.

Still to come (milestone M8 unless a feature needs one earlier): the demo page (`/demo/`,
`/it/demo/`, from `docs/demo.md` and its Italian file), docs pages, the changelog page, standards
tables and symbol/device pages generated from `library/`, the guides, real screenshots, and the
recorded demo.

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
- **The recorded demo.** A muted looping `<video autoplay muted loop playsinline>` with a poster
  plays in the hero, and the full version is on the demo page (`site/video/hero.webm`, `hero.mp4`,
  `demo.webm`, `demo.mp4`, posters `hero-poster.png` and `demo-poster.png`, captions `demo.en.vtt`
  and `demo.it.vtt`). Until `hero.*` / `demo.*` exist the pages show a "recording in progress" slot.
  Once any recording file exists, `scripts/check-site.mjs` fails if one of the files is missing or
  over its budget (8 MB demo, 2 MB hero loop).
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
