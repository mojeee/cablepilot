#!/usr/bin/env node
// Builds the static website in site/ (English at /, Italian at /it/): landing page, "For
// companies", 404, robots.txt, sitemap.xml, _headers and _redirects. Run `npm run build:site` after
// editing scripts/site/*, docs/roadmap.md, CHANGELOG.md, package.json or library/.
//
// Output is committed, because Cloudflare Pages serves site/ as it is (no build step), and CI
// checks that the committed output is up to date. The build is deterministic: no dates, no
// randomness, stable ordering. It fails on a missing Italian text and on a broken internal link
// (scripts/check-site.mjs). No JavaScript on any page, no request to a third party, no tracking.
// Same approach as MechPilot's site build; see docs/website.md.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { TEXT } from './site/texts.mjs';
import { escapeHtml as esc } from './site/markdown.mjs';
import { checkSite } from './check-site.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = 'https://cablepilot.agentflowbind.com';
const REPO = 'https://github.com/mojeee/cablepilot';
const RELEASES = `${REPO}/releases/latest`;
const DISCUSSIONS = `${REPO}/discussions`;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const siteDir = join(root, 'site');
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n?/g, '\n');

// ---------------------------------------------------------------------------------------------
// Texts: every text exists in English and Italian, or the build fails with the full list.

const missing = new Set();
function tx(lang, key) {
  const e = TEXT[key];
  if (!e) {
    missing.add(`unknown key ${key}`);
    return '';
  }
  if (!e.en || !e.it) missing.add(`${key} (${e.en ? 'it' : 'en'})`);
  return e[lang] ?? '';
}

// ---------------------------------------------------------------------------------------------
// Status from docs/roadmap.md: a milestone is done when every box under it is ticked. Headings are
// "## M4 Checks and revisions"; a milestone may be split ("## M7-AI Assistant"): parts count together.

const sections = [];
{
  let cur = null;
  for (const line of read('docs/roadmap.md').split('\n')) {
    const h = /^## (M\d+)\b[- ]*(.*)$/.exec(line);
    if (h) {
      cur = { id: h[1], title: h[2].trim(), boxes: 0, ticked: 0 };
      sections.push(cur);
      continue;
    }
    if (/^## /.test(line)) cur = null;
    const box = /^- \[( |x)\]/.exec(line);
    if (cur && box) {
      cur.boxes++;
      if (box[1] === 'x') cur.ticked++;
    }
  }
}
const milestones = {};
for (const sec of sections) {
  const m = (milestones[sec.id] ??= { id: sec.id, boxes: 0, ticked: 0 });
  m.boxes += sec.boxes;
  m.ticked += sec.ticked;
}
const done = (id) => {
  const m = milestones[id];
  if (!m) throw new Error(`docs/roadmap.md has no milestone ${id}`);
  return m.boxes > 0 && m.ticked === m.boxes;
};
const milestoneIds = Object.keys(milestones).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const doneCount = milestoneIds.filter(done).length;
const releaseSection = sections.find((s) => /^release\b/i.test(s.title));
if (!releaseSection) throw new Error('docs/roadmap.md has no "## M8 Release …" section: the website reads it');
const releaseOut = releaseSection.boxes > 0 && releaseSection.ticked === releaseSection.boxes;

// The AI gate: the assistant is described as shipped only when every box under
// "## M7-AI Assistant" is ticked. Both wordings are built and translated on every build.
const aiSection = sections.find((s) => s.id === 'M7' && /^AI\b/i.test(s.title));
if (!aiSection || aiSection.boxes === 0) {
  throw new Error('docs/roadmap.md has no "## M7-AI Assistant" section with boxes: the website reads it to decide whether the AI assistant has shipped');
}
const aiReady = aiSection.ticked === aiSection.boxes;

const hash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 10);
const css = read('scripts/site/style.css');
const CSS_URL = `/style.css?v=${hash(css)}`;
const imgExists = (name) => existsSync(join(siteDir, 'img', name));
const videoExists = (name) => existsSync(join(siteDir, 'video', name));
const heroVideo = videoExists('hero.webm') && videoExists('hero.mp4');
const demoVideo = videoExists('demo.webm') && videoExists('demo.mp4');

// ---------------------------------------------------------------------------------------------
// Output registry: every page and file goes through here, so the sitemap and the link check see it.

const files = new Map();
const pages = [];
function emit(rel, content) {
  if (files.has(rel)) throw new Error(`site/${rel} written twice`);
  files.set(rel, content);
}
const HOME = { en: '/', it: '/it/' };
const COMPANIES = { en: '/companies/', it: '/it/aziende/' };
const LOGO = '<img src="/logo.svg" alt="" width="28" height="28" />';

/** `<!-- if x --> a <!-- else --> b <!-- end -->`: both branches are kept in the source, one is output. */
function conditions(html, flags) {
  return html.replace(/<!-- if (\w+) -->([\s\S]*?)(?:<!-- else -->([\s\S]*?))?<!-- end -->/g, (_m, flag, yes, no = '') => {
    if (!(flag in flags)) throw new Error(`unknown condition "${flag}" in a template`);
    return flags[flag] ? yes : no;
  });
}
/** Fills {{t:key}} from the texts and {{name}} from `vars`. */
function fill(html, lang, vars) {
  return html
    .replace(/\{\{t:([\w.]+)\}\}/g, (_m, key) => esc(tx(lang, key)))
    .replace(/\{\{(\w+)\}\}/g, (_m, name) => {
      if (!(name in vars)) throw new Error(`template variable {{${name}}} has no value`);
      return vars[name];
    });
}
function template(name, lang, vars) {
  // Both branches of every condition must have their texts translated even when only one is shown.
  const src = read(`scripts/site/${name}`);
  for (const k of [true, false]) fill(conditions(src, { ai: k }), lang, vars);
  return fill(conditions(src, { ai: aiReady }), lang, vars);
}

function page({ lang, path, alt, title, description, body, section = '', full = true }) {
  const other = lang === 'en' ? 'it' : 'en';
  const links = [
    `<link rel="canonical" href="${SITE}${path}" />`,
    `<link rel="alternate" hreflang="${lang}" href="${SITE}${path}" />`,
    `<link rel="alternate" hreflang="${other}" href="${SITE}${alt}" />`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}${lang === 'en' ? path : alt}" />`,
  ];
  const footLinks = (items) => `<ul>${items.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul>`;
  const html = `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    ${links.join('\n    ')}
    <link rel="icon" href="/logo.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#0f1216" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="CablePilot" />
    <meta property="og:locale" content="${lang === 'en' ? 'en_GB' : 'it_IT'}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${SITE}${path}" />
    <meta property="og:image" content="${SITE}/og.svg" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="stylesheet" href="${CSS_URL}" />
  </head>
  <body>
    <a class="skip" href="#main">${esc(tx(lang, 'nav.skip'))}</a>
    <header class="top">
      <div class="wrap top-in">
        <a class="logo" href="${HOME[lang]}">${LOGO} CablePilot</a>
        <nav class="main-nav" aria-label="${esc(tx(lang, 'nav.main'))}">
          <a href="${HOME[lang]}#demo">${esc(tx(lang, 'nav.demo'))}</a>
          <a href="${COMPANIES[lang]}"${section === 'companies' ? ' aria-current="page"' : ''}>${esc(tx(lang, 'nav.companies'))}</a>
          <a href="${REPO}">GitHub</a>
          <a href="${alt}" hreflang="${other}" lang="${other}">${other === 'it' ? 'Italiano' : 'English'}</a>
        </nav>
        <a class="btn primary sm" href="${HOME[lang]}#download">${esc(tx(lang, 'nav.download'))}</a>
      </div>
    </header>
    <main id="main">
      ${body.trim()}
    </main>
    <footer class="foot">
      <div class="wrap">
        <div class="foot-grid">
          <div>
            <a class="logo" href="${HOME[lang]}">${LOGO} CablePilot</a>
            <p>${esc(tx(lang, 'foot.tagline'))}</p>
          </div>
          <nav aria-label="${esc(tx(lang, 'nav.footer'))}">
            ${footLinks([
              [tx(lang, 'nav.demo'), `${HOME[lang]}#demo`],
              [tx(lang, 'nav.download'), `${HOME[lang]}#download`],
              [tx(lang, 'nav.companies'), COMPANIES[lang]],
              ['GitHub', REPO],
              [tx(lang, 'foot.discussions'), DISCUSSIONS],
              [tx(lang, 'foot.releases'), `${REPO}/releases`],
            ])}
          </nav>
        </div>
        <div class="foot-base">
          <p>${esc(tx(lang, 'foot.copyright'))} ${esc(tx(lang, 'foot.version'))} ${esc(pkg.version)}.</p>
          <p>${esc(tx(lang, 'foot.privacy'))}</p>
        </div>
      </div>
    </footer>
  </body>
</html>
`;
  emit(path.replace(/^\//, '') + 'index.html', html);
  pages.push({ path, lang, alt });
}

// ---------------------------------------------------------------------------------------------
// Landing page pieces generated from the roadmap and the texts.

const FEATURES = [
  { key: 'schematic', m: 'M1', std: ['IEC 60617', 'IEC 81346', 'IEC 61082', 'ISO 5457'] },
  { key: 'devices', m: 'M2', std: ['IEC 81346', 'IEC 61439'] },
  { key: 'reports', m: 'M3', std: ['IEC 60204-1', 'IEC 60445', 'IEC 60757'] },
  { key: 'checks', m: 'M4', std: ['IEC 60364-5-52', 'IEC 60204-1'] },
  { key: 'plc', m: 'M5', std: [] },
  { key: 'layout', m: 'M6', std: ['IEC 61439'] },
];
const statusTag = (lang, m) =>
  done(m) ? `<span class="tag available">${esc(tx(lang, 'tag.available'))}</span>` : `<span class="tag planned">${esc(tx(lang, 'tag.planned'))} (${m})</span>`;

function landingVars(lang) {
  // Screenshots come from the real app (npm run screenshots, e2e/screenshots.e2e.ts) and show only for features that are done.
  const featImg = (f) => (done(f.m) && imgExists(`feat-${f.key}.png`) ? `<img class="card-img" src="/img/feat-${f.key}.png" alt="${esc(tx(lang, `feat.${f.key}.alt`))}" width="1200" height="700" loading="lazy" />` : '');
  const features = FEATURES.map(
    (f) => `<article class="card">${featImg(f)}<h3>${esc(tx(lang, `feat.${f.key}.title`))}</h3>${statusTag(lang, f.m)}<p>${esc(tx(lang, `feat.${f.key}.text`))}</p>${f.std.map((s) => `<span class="std">${esc(s)}</span>`).join('')}</article>`,
  ).join('\n      ');
  const strip = ['cover', 'single', 'multi', 'terminals', 'layout', 'bom']
    .map((k) => (imgExists(`set-${k}.png`) ? `<li class="thumb has-img"><img src="/img/set-${k}.png" alt="${esc(tx(lang, `set.${k}`))}" width="600" height="420" loading="lazy" /><span>${esc(tx(lang, `set.${k}`))}</span></li>` : `<li class="thumb">${esc(tx(lang, `set.${k}`))}</li>`))
    .join('\n      ');
  const shot = (theme) => (imgExists(`app-${theme}.png`) ? `<div class="shot shot-${theme}-img has-img"><img src="/img/app-${theme}.png" alt="${esc(tx(lang, `shot.${theme}.alt`))}" width="1440" height="900" loading="lazy" /></div>` : `<div class="shot shot-${theme}-img"><p>${esc(tx(lang, 'shot.pending'))}</p></div>`);
  const rows = [
    ['open', null],
    ['local', null],
    ['schematic', 'M1'],
    ['reports', 'M3'],
    ['checks', 'M4'],
    ['layout', 'M6'],
    ['set', 'M4'],
    ['ai', 'M7'],
  ];
  const compare = `<table><thead><tr><th scope="col">${esc(tx(lang, 'cmp.feature'))}</th><th scope="col">${esc(tx(lang, 'cmp.status'))}</th></tr></thead><tbody>${rows
    .map(([k, m]) => `<tr><th scope="row">${esc(tx(lang, `cmp.row.${k}`))}</th><td>${m === null ? `<span class="tag available">${esc(tx(lang, 'tag.available'))}</span>` : k === 'ai' && !aiReady ? `<span class="tag planned">${esc(tx(lang, 'tag.planned'))} (${m})</span>` : statusTag(lang, m)}</td></tr>`)
    .join('')}</tbody></table>`;
  const status = `${tx(lang, 'status.version')} ${pkg.version} · ${doneCount}/${milestoneIds.length} ${tx(lang, 'status.milestones')} · ${tx(lang, releaseOut ? 'status.out' : 'status.notOut')}`;
  // The hero loop: a <video autoplay muted loop playsinline> with a poster once the recording exists
  // (npm run record:demo, M8); until then a placeholder slot.
  const heroMedia = heroVideo
    ? `<video autoplay muted loop playsinline poster="/video/hero-poster.png"><source src="/video/hero.webm" type="video/webm" /><source src="/video/hero.mp4" type="video/mp4" /></video>`
    : `<div class="video-slot"><p>${esc(tx(lang, 'hero.video.note'))}</p></div>`;
  const demoMedia = demoVideo
    ? `<video controls playsinline preload="none" poster="/video/demo-poster.png"><source src="/video/demo.webm" type="video/webm" /><source src="/video/demo.mp4" type="video/mp4" /></video>`
    : `<div class="video-slot"><p>${esc(tx(lang, 'demo.pending'))}</p></div>`;
  return { features, strip, shotDark: shot('dark'), shotLight: shot('light'), compare, status, heroMedia, demoMedia, RELEASES, DISCUSSIONS, companiesHref: COMPANIES[lang] };
}

for (const lang of ['en', 'it']) {
  const other = lang === 'en' ? 'it' : 'en';
  page({ lang, path: HOME[lang], alt: HOME[other], title: tx(lang, 'home.title'), description: tx(lang, 'home.description'), body: template('index.template.html', lang, landingVars(lang)) });
  page({
    lang,
    path: COMPANIES[lang],
    alt: COMPANIES[other],
    title: tx(lang, 'co.title'),
    description: tx(lang, 'co.description'),
    body: template('companies.template.html', lang, { DISCUSSIONS }),
    section: 'companies',
  });
}

emit(
  '404.html',
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(TEXT['nf.title'].en)} · CablePilot</title>
    <meta name="robots" content="noindex" />
    <link rel="icon" href="/logo.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${CSS_URL}" />
  </head>
  <body>
    <header class="top"><div class="wrap top-in"><a class="logo" href="/">${LOGO} CablePilot</a></div></header>
    <main id="main">
      <section class="hero hero-sub">
        <div class="wrap">
          <h1>${esc(TEXT['nf.title'].en)}</h1>
          <p class="lead">${esc(TEXT['nf.text'].en)} <a href="/">/</a></p>
          <h2 lang="it">${esc(TEXT['nf.title'].it)}</h2>
          <p class="lead" lang="it">${esc(TEXT['nf.text'].it)} <a href="/it/">/it/</a></p>
        </div>
      </section>
    </main>
  </body>
</html>
`,
);

if (missing.size) throw new Error(`Missing site texts (add them to scripts/site/texts.mjs):\n${[...missing].map((m) => `  ${m}`).join('\n')}`);

emit('style.css', css);
emit('logo.svg', read('scripts/site/logo.svg'));
emit('og.svg', read('scripts/site/og.svg'));
emit('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
const sorted = [...pages].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
emit(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    sorted
      .map((p) => {
        const other = p.lang === 'en' ? 'it' : 'en';
        const alts = [[p.lang, p.path], [other, p.alt]]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([l, href]) => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${href}"/>`)
          .join('');
        return `  <url><loc>${SITE}${p.path}</loc>${alts}</url>`;
      })
      .join('\n') +
    '\n</urlset>\n',
);
// Cloudflare Pages headers: strict security, no third parties, long cache for hashed assets.
emit(
  '_headers',
  [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    "  Content-Security-Policy: default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    '/style.css',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/img/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/video/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n'),
);
// Short links to share (302: they may point elsewhere later).
emit('_redirects', `/download ${RELEASES} 302\n/discussions ${DISCUSSIONS} 302\n`);

// Everything in site/ except img/ and video/ (screenshots and recordings are not built) is rewritten.
for (const f of readdirSync(siteDir)) if (f !== 'img' && f !== 'video') rmSync(join(siteDir, f), { recursive: true, force: true });
for (const [rel, content] of [...files.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const p = join(siteDir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const problems = checkSite(siteDir, SITE);
if (problems.length) {
  console.error(problems.join('\n'));
  throw new Error(`site/ has ${problems.length} problem(s), see above`);
}
console.log(`site/ built: ${pages.length} pages, links checked; ${doneCount}/${milestoneIds.length} milestones done, assistant ${aiReady ? 'shipped' : 'coming'}`);
