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
import { escapeHtml as esc, renderMarkdown } from './site/markdown.mjs';
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
// A feature can follow one section of a split milestone: "Sizing and warehouse" is the first part of M6.
const sectionDone = (re) => {
  const s = sections.find((x) => re.test(x.title));
  if (!s) throw new Error(`docs/roadmap.md has no section matching ${re}`);
  return s.boxes > 0 && s.ticked === s.boxes;
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


// ---------------------------------------------------------------------------------------------
// The demo walkthrough: docs/demo.md in English, scripts/site/demo.it.md in Italian with the same
// "## N. Title" sections (N = 1, 2, ... in order). Each step gets a frame of the recording
// (site/img/demo-N.png, written by scripts/demo-video.mjs) when it exists. Other "## " sections are ignored.

function parseDemo(src, file) {
  const parts = src.split(/\n(?=## )/);
  const title = /^# (.*)$/m.exec(parts[0])?.[1].trim();
  if (!title) throw new Error(`${file}: no "# " title`);
  const intro = parts[0].replace(/^# .*\n+/, '').trim();
  const steps = [];
  for (const part of parts.slice(1)) {
    const h = /^## (\d+)\.\s+(.+)\n/.exec(part);
    if (!h) continue;
    steps.push({ n: Number(h[1]), title: h[2].trim(), body: part.slice(h[0].length).trim() });
  }
  if (!steps.length || steps.some((s, k) => s.n !== k + 1)) throw new Error(`${file}: the walkthrough needs sections "## 1. ...", "## 2. ..." numbered in order`);
  return { title, intro, steps };
}
const demoSource = read('docs/demo.md');
const demoItFile = 'scripts/site/demo.it.md';
const demo = { en: parseDemo(demoSource, 'docs/demo.md') };
{
  let src = read(demoItFile);
  let source = '';
  src = src.replace(/^<!--\s*([\s\S]*?)-->\n/, (_, block) => {
    source = (/^\s*source:\s*(\S+)/m.exec(block) ?? [])[1] ?? '';
    return '';
  });
  demo.it = parseDemo(src, demoItFile);
  if (demo.en.steps.length !== demo.it.steps.length) throw new Error(`${demoItFile} has ${demo.it.steps.length} steps, docs/demo.md has ${demo.en.steps.length}: translate the changed steps`);
  // The Italian file records the hash of the English text it translates; a newer English text is a warning.
  const current = createHash('sha1').update(demoSource).digest('hex').slice(0, 10);
  if (source !== current) console.warn(`warning: docs/demo.md changed since ${demoItFile} was translated (source ${source || 'missing'}, now ${current}): update the Italian text and its "source:" line`);
}

/** Inline Markdown of the demo texts: `code` and **bold**, escaped. */
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
/** Paragraphs and "- " lists of a step. */
function demoBlocks(body) {
  return body
    .split(/\n\s*\n/)
    .map((b) => (b.split('\n').every((l) => /^- /.test(l)) ? `<ul class="bullets">${b.split('\n').map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>` : `<p>${inline(b.replace(/\n/g, ' '))}</p>`))
    .join('\n          ');
}

const hash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 10);
const css = read('scripts/site/style.css');
const CSS_URL = `/style.css?v=${hash(css)}`;
const imgExists = (name) => existsSync(join(siteDir, 'img', name));
const videoExists = (name) => existsSync(join(siteDir, 'video', name));
// A recording counts once its WebM and MP4 and its poster (site/img/) exist; scripts/check-site.mjs then demands the rest.
const heroVideo = videoExists('hero.webm') && videoExists('hero.mp4') && imgExists('hero-poster.png');
const demoVideo = videoExists('demo.webm') && videoExists('demo.mp4') && imgExists('demo-poster.png');
// The short clips (npm run record:clips, e2e/clips.json): one per feature area and language, captions in the picture.
// A clip shows in a language once its MP4 and poster exist; the section shows once any clip does.
const CLIPS = JSON.parse(read('e2e/clips.json')).clips;
const clipReady = (id, lang) => videoExists(`clip-${id}-${lang}.mp4`) && videoExists(`clip-${id}-${lang}.jpg`);

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
const DEMO = { en: '/demo/', it: '/it/demo/' };
const DOCS = { en: '/docs/', it: '/it/docs/' };
// The user guides published as pages (docs/<slug>.md in English, scripts/site/docs.it/<slug>.md in Italian).
const DOC_PAGES = [{ slug: 'getting-started' }, { slug: 'numbering' }, { slug: 'file-format' }];
const docHref = (lang, slug) => `${DOCS[lang]}${slug}/`;
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

const GH_ICON = '<svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

/** JSON for a <script type="application/ld+json"> block: "</" is escaped so the data can never close the tag. */
const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/<\//g, '<\\/')}</script>`;

function page({ lang, path, alt, title, description, body, section = '', jsonld = [], ogImage = lang === 'it' ? '/img/og-it.png' : '/img/og.png' }) {
  const other = lang === 'en' ? 'it' : 'en';
  const home = HOME[lang];
  const links = [
    `<link rel="canonical" href="${SITE}${path}" />`,
    `<link rel="alternate" hreflang="${lang}" href="${SITE}${path}" />`,
    `<link rel="alternate" hreflang="${other}" href="${SITE}${alt}" />`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}${lang === 'en' ? path : alt}" />`,
  ];
  const nav = [
    [tx(lang, 'nav.features'), `${home}#features`, ''],
    [tx(lang, 'nav.videos'), `${home}#videos`, ''],
    [tx(lang, 'nav.demo'), DEMO[lang], 'demo'],
    [tx(lang, 'nav.docs'), DOCS[lang], 'docs'],
    [tx(lang, 'nav.compare'), `${home}#compare`, ''],
    [tx(lang, 'nav.faq'), `${home}#faq`, ''],
    [tx(lang, 'nav.companies'), COMPANIES[lang], 'companies'],
  ];
  const footCol = (head, items) => `<div><p class="foot-h">${esc(head)}</p><ul>${items.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul></div>`;
  const html = `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    ${links.join('\n    ')}
    <link rel="icon" href="/logo.svg" type="image/svg+xml" />
    <link rel="icon" href="/img/icon-192.png" type="image/png" sizes="192x192" />
    <link rel="apple-touch-icon" href="/img/icon-180.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta name="theme-color" content="#0f1419" />
    <meta name="color-scheme" content="dark" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="CablePilot" />
    <meta property="og:locale" content="${lang === 'en' ? 'en_GB' : 'it_IT'}" />
    <meta property="og:locale:alternate" content="${lang === 'en' ? 'it_IT' : 'en_GB'}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${SITE}${path}" />
    <meta property="og:image" content="${SITE}${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(tx(lang, 'og.alt'))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${SITE}${ogImage}" />
    <link rel="stylesheet" href="${CSS_URL}" />
    ${jsonld.map(ld).join('\n    ')}
  </head>
  <body>
    <a class="skip" href="#main">${esc(tx(lang, 'nav.skip'))}</a>
    <header class="top">
      <div class="wrap top-in">
        <a class="logo" href="${home}">${LOGO} CablePilot</a>
        <nav class="main-nav" aria-label="${esc(tx(lang, 'nav.main'))}">
          ${nav.map(([label, href, sec]) => `<a href="${href}"${sec && sec === section ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('\n          ')}
        </nav>
        <div class="nav-right">
          <div class="lang" role="group" aria-label="${esc(tx(lang, 'nav.language'))}">${lang === 'en' ? `<span aria-current="true">EN</span><a href="${alt}" hreflang="it" lang="it" title="Italiano">IT</a>` : `<a href="${alt}" hreflang="en" lang="en" title="English">EN</a><span aria-current="true">IT</span>`}</div>
          <a class="gh" href="${REPO}" aria-label="${esc(tx(lang, 'nav.github'))}" title="GitHub">${GH_ICON}</a>
          <a class="btn primary sm" href="${home}#download">${esc(tx(lang, 'nav.download'))}</a>
        </div>
      </div>
    </header>
    <main id="main">
      ${body.trim()}
    </main>
    <footer class="foot">
      <div class="wrap">
        <div class="foot-grid">
          <div>
            <a class="logo" href="${home}">${LOGO} CablePilot</a>
            <p>${esc(tx(lang, 'foot.tagline'))}</p>
          </div>
          ${footCol(tx(lang, 'foot.product'), [
            [tx(lang, 'nav.features'), `${home}#features`],
            [tx(lang, 'nav.videos'), `${home}#videos`],
            [tx(lang, 'nav.demo'), DEMO[lang]],
            [tx(lang, 'nav.download'), `${home}#download`],
            [tx(lang, 'nav.companies'), COMPANIES[lang]],
          ])}
          ${footCol(tx(lang, 'foot.docs'), DOC_PAGES.map((d) => [tx(lang, `doc.${d.slug}.title`), docHref(lang, d.slug)]))}
          ${footCol(tx(lang, 'foot.community'), [
            ['GitHub', REPO],
            [tx(lang, 'foot.discussions'), DISCUSSIONS],
            [tx(lang, 'foot.issues'), `${REPO}/issues`],
            [tx(lang, 'foot.releases'), `${REPO}/releases`],
          ])}
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
  { key: 'sizing', m: 'M6', section: /^Sizing and warehouse/i, std: ['IEC 60364-5-52', 'IEC 60364-4-43', 'IEC 60947-2', 'IEC 60947-4-1'] },
  { key: 'workspace', m: 'M6', section: /^CAD workspace with the AI inside/i, std: [] },
  { key: 'layout', m: 'M6', std: ['IEC 61439'] },
  { key: 'erp', m: 'M8', section: /^ERP link/i, std: [] },
  { key: 'panel', m: 'M8', section: /^Panel designer features/i, std: ['NFPA 79'] },
];
const featureDone = (f) => (f.section ? sectionDone(f.section) : done(f.m));
const statusTag = (lang, m, isDone = done(m)) =>
  isDone ? `<span class="tag available">${esc(tx(lang, 'tag.available'))}</span>` : `<span class="tag planned">${esc(tx(lang, 'tag.planned'))} (${m})</span>`;

// Facts of the strip under the hero, counted from the repository (never typed by hand).
const countFiles = (dir, re) => readdirSync(join(root, dir)).filter((f) => re.test(f)).length;
const FACTS = {
  symbols: countFiles('library/symbols', /\.json$/),
  parts: countFiles('library/parts', /\.json$/),
  reports: (/REPORT_IDS = \[([^\]]*)\]/.exec(read('shared/model/types.ts'))?.[1].split(',').filter((x) => x.trim()).length) ?? 0,
  samples: countFiles('samples', /\.cablepilot\.json$/),
};
// Installers on the latest GitHub Release (.github/workflows/release.yml names them).
const INSTALLERS = [
  { key: 'mac', file: 'CablePilot-mac-arm64.dmg', icon: 'apple' },
  { key: 'macIntel', file: 'CablePilot-mac-x64.dmg', icon: 'apple' },
  { key: 'win', file: 'CablePilot-win-x64.exe', icon: 'windows' },
  { key: 'linux', file: 'CablePilot-linux-x86_64.AppImage', icon: 'linux' },
];
const OS_ICON = {
  apple: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.1.8 1.3 0 2.1-1.2 2.9-2.4.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.6-1-2.7-4.1zM14.1 5.6c.6-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z"/></svg>',
  windows: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5l7.5-1v7H3zm8.5-1.2L21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zm8.5 0H21V21l-9.5-1.3z"/></svg>',
  linux: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c-2.2 0-3.6 1.9-3.6 4.6 0 1.3.3 2.3-.5 3.6-1.3 1.9-3 4.3-2.6 6.8.2 1.1.9 1.6 1.6 1.9-.4.7-.4 1.6.5 2 .9.4 2 .1 3-.4.6.2 1.2.3 1.6.3s1-.1 1.6-.3c1 .5 2.1.8 3 .4.9-.4.9-1.3.5-2 .7-.3 1.4-.8 1.6-1.9.4-2.5-1.3-4.9-2.6-6.8-.8-1.3-.5-2.3-.5-3.6C15.6 3.9 14.2 2 12 2z"/></svg>',
};
// The questions of the FAQ (texts faq.qN / faq.aN), shown on the page and given to search engines as FAQPage data.
const FAQ_COUNT = 9;

function landingVars(lang) {
  // Screenshots come from the real app (npm run screenshots, e2e/screenshots.e2e.ts) and show only for features that are done.
  const featImg = (f) => {
    if (!featureDone(f) || !imgExists(`feat-${f.key}.png`)) return '';
    const one = (file, alt) => `<img class="card-img" src="/img/${file}" alt="${esc(tx(lang, alt))}" width="1200" height="700" loading="lazy" decoding="async" />`;
    // The cabinet layout shows its 2D front view and its 3D view.
    return one(`feat-${f.key}.png`, `feat.${f.key}.alt`) + (imgExists(`feat-${f.key}3d.png`) ? one(`feat-${f.key}3d.png`, `feat.${f.key}3d.alt`) : '');
  };
  const features = FEATURES.map(
    (f) => `<article class="card" id="feature-${f.key}">${featImg(f)}<div class="card-head"><h3>${esc(tx(lang, `feat.${f.key}.title`))}</h3>${statusTag(lang, f.m, featureDone(f))}</div><p>${esc(tx(lang, `feat.${f.key}.text`))}</p>${f.std.map((s) => `<span class="std">${esc(s)}</span>`).join('')}</article>`,
  ).join('\n      ');
  const strip = ['cover', 'single', 'multi', 'terminals', 'layout', 'bom']
    .map((k) => (imgExists(`set-${k}.png`) ? `<li class="thumb has-img"><img src="/img/set-${k}.png" alt="${esc(tx(lang, `set.${k}`))}" width="600" height="420" loading="lazy" decoding="async" /><span>${esc(tx(lang, `set.${k}`))}</span></li>` : `<li class="thumb">${esc(tx(lang, `set.${k}`))}</li>`))
    .join('\n      ');
  const shot = (theme) => (imgExists(`app-${theme}.png`) ? `<div class="shot shot-${theme}-img has-img"><img src="/img/app-${theme}.png" alt="${esc(tx(lang, `shot.${theme}.alt`))}" width="1440" height="900" loading="lazy" decoding="async" /></div>` : `<div class="shot shot-${theme}-img"><p>${esc(tx(lang, 'shot.pending'))}</p></div>`);
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
  const compare = `<div class="table-wrap"><table><thead><tr><th scope="col">${esc(tx(lang, 'cmp.feature'))}</th><th scope="col">${esc(tx(lang, 'cmp.status'))}</th></tr></thead><tbody>${rows
    .map(([k, m]) => `<tr><th scope="row">${esc(tx(lang, `cmp.row.${k}`))}</th><td>${m === null ? `<span class="tag available">${esc(tx(lang, 'tag.available'))}</span>` : k === 'ai' && !aiReady ? `<span class="tag planned">${esc(tx(lang, 'tag.planned'))} (${m})</span>` : statusTag(lang, m)}</td></tr>`)
    .join('')}</tbody></table></div>`;
  const status = `${tx(lang, 'status.version')} ${pkg.version} · ${doneCount}/${milestoneIds.length} ${tx(lang, 'status.milestones')} · ${tx(lang, releaseOut ? 'status.out' : 'status.notOut')}`;
  // The hero loop: a <video autoplay muted loop playsinline> with a poster once the recording exists; until then a slot.
  const heroMedia = heroVideo
    ? `<video autoplay muted loop playsinline poster="/img/hero-poster.png" width="1280" height="720" aria-label="${esc(tx(lang, 'hero.video.alt'))}"><source src="/video/hero.webm" type="video/webm" /><source src="/video/hero.mp4" type="video/mp4" /></video>`
    : `<div class="video-slot"><p>${esc(tx(lang, 'hero.video.note'))}</p></div>`;
  const demoMedia = demoVideo
    ? `<a class="demo-poster" href="${DEMO[lang]}"><img src="/img/demo-poster.png" alt="${esc(tx(lang, 'demo.poster.alt'))}" width="1920" height="1080" loading="lazy" decoding="async" /></a>\n    <p class="actions"><a class="btn primary" href="${DEMO[lang]}">${esc(tx(lang, 'demo.watch'))}</a></p>`
    : `<div class="video-slot"><p>${esc(tx(lang, 'demo.pending'))}</p></div>`;
  // Download buttons link straight to the installers once release 1 is out; until then they say so honestly.
  const installerButtons = (cls) => INSTALLERS.map((i, k) => `<a class="btn${k === 0 ? ` ${cls}` : ''}" href="${REPO}/releases/latest/download/${i.file}">${OS_ICON[i.icon]}${esc(tx(lang, `dl.${i.key}`))}</a>`).join('\n        ');
  const heroActions = releaseOut
    ? `<p class="actions">${installerButtons('primary')}</p>`
    : `<p class="actions"><a class="btn primary" href="${DEMO[lang]}">${esc(tx(lang, 'hero.demo'))}</a> <a class="btn" href="${REPO}/releases">${GH_ICON}${esc(tx(lang, 'hero.follow'))}</a></p>`;
  const downloadActions = releaseOut
    ? `<p class="actions os-list">${installerButtons('primary')}</p>`
    : `<p class="actions"><a class="btn primary" href="${REPO}/releases">${esc(tx(lang, 'dl.follow'))}</a> <a class="btn" href="${REPO}">${GH_ICON}${esc(tx(lang, 'dl.source'))}</a></p>`;
  const chipDefs = [
    ['schematic', '', '#feature-schematic'], ['reports', 'g', '#feature-reports'], ['checks', 'y', '#feature-checks'], ['plc', '', '#feature-plc'],
    ['layout', 'g', '#feature-layout'], ['sizing', 'y', '#feature-sizing'], ['erp', '', '#feature-erp'], ['ai', 'v', '#ai'], ['offline', 'g', '#why'],
  ];
  const chips = chipDefs.map(([k, c, href]) => `<a href="${href}"><i${c ? ` class="${c}"` : ''}></i>${esc(tx(lang, `chip.${k}`))}</a>`).join('\n        ');
  const facts = [
    [String(FACTS.symbols), tx(lang, 'facts.symbols')],
    [String(FACTS.parts), tx(lang, 'facts.parts')],
    [String(FACTS.reports), tx(lang, 'facts.reports')],
    [String(FACTS.samples), tx(lang, 'facts.samples')],
    ['EN · IT', tx(lang, 'facts.languages')],
  ].map(([b, label]) => `<div><b>${esc(b)}</b><span>${esc(label)}</span></div>`).join('\n    ');
  const docCards = DOC_PAGES.map((d) => `<a class="card" href="${docHref(lang, d.slug)}"><h3>${esc(tx(lang, `doc.${d.slug}.title`))}</h3><p>${esc(tx(lang, `doc.${d.slug}.description`))}</p><span class="more">${esc(tx(lang, 'docs.read'))} →</span></a>`).join('\n      ');
  const faqItems = Array.from({ length: FAQ_COUNT }, (_, k) => ({ q: tx(lang, `faq.q${k + 1}`), a: tx(lang, `faq.a${k + 1}`) }));
  const faq = faqItems.map(({ q, a }) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n      ');
  const clips = CLIPS.filter((c) => clipReady(c.id, lang));
  const clipsSection = clips.length
    ? `<section class="band" id="videos">
  <div class="wrap">
    <div class="sec-head center">
      <p class="eyebrow">${esc(tx(lang, 'clips.eyebrow'))}</p>
      <h2>${esc(tx(lang, 'clips.title'))}</h2>
      <p class="lead">${esc(tx(lang, 'clips.lead'))}</p>
    </div>
    <div class="video-grid">
      ${clips.map((c) => `<figure class="video-card" id="video-${c.id}"><video src="/video/clip-${c.id}-${lang}.mp4" poster="/video/clip-${c.id}-${lang}.jpg" width="1280" height="720" controls muted loop playsinline preload="none" aria-label="${esc(c.title[lang])}"></video><figcaption><b>${esc(c.title[lang])}</b><span>${esc(c.desc[lang])}</span></figcaption></figure>`).join('\n      ')}
    </div>
    <p class="note center">${esc(tx(lang, 'clips.note'))}</p>
  </div>
</section>`
    : '';
  // Structured data: the app, the site and the FAQ (schema.org), for richer search results.
  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'CablePilot',
      applicationCategory: 'DesignApplication',
      applicationSubCategory: tx(lang, 'ld.category'),
      operatingSystem: 'macOS, Windows, Linux',
      softwareVersion: pkg.version,
      description: tx(lang, 'home.description'),
      url: `${SITE}${HOME[lang]}`,
      downloadUrl: `${REPO}/releases/latest`,
      installUrl: `${REPO}/releases/latest`,
      license: 'https://www.apache.org/licenses/LICENSE-2.0',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      inLanguage: ['en', 'it'],
      screenshot: `${SITE}/img/app-dark.png`,
      image: `${SITE}/img/og.png`,
      codeRepository: REPO,
      featureList: FEATURES.filter(featureDone).map((f) => tx(lang, `feat.${f.key}.title`)),
    },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'CablePilot', url: `${SITE}${HOME[lang]}`, inLanguage: lang },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqItems.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  const downloadNote = esc(tx(lang, releaseOut ? 'dl.note.out' : 'dl.note'));
  return { features, strip, shotDark: shot('dark'), shotLight: shot('light'), compare, status, heroMedia, heroActions, downloadActions, downloadNote, chips, facts, docCards, faq, demoMedia, clipsSection, jsonld, demoHref: DEMO[lang], RELEASES, DISCUSSIONS, companiesHref: COMPANIES[lang] };
}

for (const lang of ['en', 'it']) {
  const other = lang === 'en' ? 'it' : 'en';
  const vars = landingVars(lang);
  page({ lang, path: HOME[lang], alt: HOME[other], title: tx(lang, 'home.title'), description: tx(lang, 'home.description'), body: template('index.template.html', lang, vars), jsonld: vars.jsonld });
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


// The demo page (/demo/, /it/demo/): the recording with its caption tracks on top, then the walkthrough
// of docs/demo.md, one section per step with the frame of the recording where the step starts.
for (const lang of ['en', 'it']) {
  const other = lang === 'en' ? 'it' : 'en';
  const d = demo[lang];
  // Both states are translated on every build, so a new recording never breaks the Italian check.
  const noPlay = tx(lang, 'demo.noplay');
  const download = tx(lang, 'demo.download');
  const video = demoVideo
    ? `<figure class="demo-video">
            <video controls playsinline preload="metadata" poster="/img/demo-poster.png" width="1920" height="1080">
              <source src="/video/demo.webm" type="video/webm" />
              <source src="/video/demo.mp4" type="video/mp4" />
              <track kind="captions" src="/video/demo.en.vtt" srclang="en" label="English"${lang === 'en' ? ' default' : ''} />
              <track kind="captions" src="/video/demo.it.vtt" srclang="it" label="Italiano"${lang === 'it' ? ' default' : ''} />
              <p>${esc(noPlay)} <a href="/video/demo.mp4">${esc(download)}</a></p>
            </video>
            <figcaption>${esc(tx(lang, 'demo.caption'))}</figcaption>
          </figure>`
    : `<div class="video-slot"><p>${esc(tx(lang, 'demo.pending'))}</p></div>`;
  const toc = d.steps.map((s) => `<li><a href="#step-${s.n}"><span>${String(s.n).padStart(2, '0')}</span> ${inline(s.title)}</a></li>`).join('\n            ');
  const stepHtml = d.steps
    .map((s) => {
      const frame = imgExists(`demo-${s.n}.png`) ? `<figure class="step-shot"><img src="/img/demo-${s.n}.png" alt="${esc(tx(lang, `demo.step${s.n}.alt`))}" width="1920" height="1080" loading="lazy" /></figure>` : '';
      return `<section class="step${s.n % 2 ? '' : ' alt'}" id="step-${s.n}" aria-labelledby="step-${s.n}-h">
        <div class="wrap step-grid">
          <div class="step-text">
          <h2 id="step-${s.n}-h"><span class="label">${esc(tx(lang, 'demo.step'))} ${s.n}</span> ${inline(s.title)}</h2>
          ${demoBlocks(s.body)}
          </div>
          ${frame}
        </div>
      </section>`;
    })
    .join('\n      ');
  // Every step's frame alt text must exist in both languages, shown or not.
  for (const s of d.steps) tx(lang, `demo.step${s.n}.alt`);
  const body = `<section class="hero hero-sub">
        <div class="wrap">
          <p class="eyebrow">${esc(tx(lang, 'nav.demo'))}</p>
          <h1>${inline(d.title)}</h1>
          <div class="lead">${demoBlocks(d.intro)}</div>
          ${video}
          <h2 class="toc-h">${esc(tx(lang, 'demo.chapters'))}</h2>
          <ol class="step-toc">
            ${toc}
          </ol>
        </div>
      </section>
      ${stepHtml}
      <section class="band dark try" aria-labelledby="try-h">
        <div class="wrap">
          <h2 id="try-h">${esc(tx(lang, 'demo.try.title'))}</h2>
          <p class="lead">${esc(tx(lang, 'demo.try.text'))}</p>
          <p class="actions"><a class="btn primary" href="${RELEASES}">${esc(tx(lang, 'hero.download'))}</a> <a class="btn" href="${HOME[lang]}">${esc(tx(lang, 'demo.home'))}</a></p>
        </div>
      </section>`;
  page({ lang, path: DEMO[lang], alt: DEMO[other], title: tx(lang, 'demo.page.title'), description: tx(lang, 'demo.page.description'), body, section: 'demo' });
}

// ---------------------------------------------------------------------------------------------
// The user guides as pages: /docs/ (index) and /docs/<slug>/. English from docs/<slug>.md, Italian from
// scripts/site/docs.it/<slug>.md, which records the hash of the English text it translates (a newer English text is a
// warning, like the demo walkthrough). Links to other guides become site pages; links to repository files go to GitHub.

const docLink = (lang) => (href) => {
  if (/^(https?:|#)/.test(href)) return href;
  const [file, anchor] = href.split('#');
  const name = file.replace(/^\.\//, '');
  const slug = name.replace(/\.md$/, '');
  if (DOC_PAGES.some((d) => d.slug === slug)) return docHref(lang, slug) + (anchor ? `#${anchor}` : '');
  const repoPath = name.startsWith('../') ? name.slice(3) : `docs/${name}`;
  return `${REPO}/blob/main/${repoPath}${anchor ? `#${anchor}` : ''}`;
};
function docSource(lang, slug) {
  const en = read(`docs/${slug}.md`);
  if (lang === 'en') return en;
  const file = `scripts/site/docs.it/${slug}.md`;
  let source = '';
  const it = read(file).replace(/^<!--\s*([\s\S]*?)-->\n/, (_, block) => {
    source = (/^\s*source:\s*(\S+)/m.exec(block) ?? [])[1] ?? '';
    return '';
  });
  const current = hash(en);
  if (source !== current) console.warn(`warning: docs/${slug}.md changed since ${file} was translated (source ${source || 'missing'}, now ${current}): update the Italian text and its "source:" line`);
  return it;
}
const crumbsLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], k) => ({ '@type': 'ListItem', position: k + 1, name, item: `${SITE}${path}` })) });

for (const lang of ['en', 'it']) {
  const other = lang === 'en' ? 'it' : 'en';
  const home = HOME[lang];
  const docNav = (current) => `<nav aria-label="${esc(tx(lang, 'docs.nav'))}"><ul class="doc-nav">${DOC_PAGES.map((d) => `<li><a href="${docHref(lang, d.slug)}"${d.slug === current ? ' aria-current="page"' : ''}>${esc(tx(lang, `doc.${d.slug}.title`))}</a></li>`).join('')}</ul></nav>`;
  const cta = `<div class="cta-box"><h2>${esc(tx(lang, 'docs.cta.title'))}</h2><p class="lead">${esc(tx(lang, 'docs.cta.text'))}</p><p class="actions"><a class="btn primary" href="${home}#download">${esc(tx(lang, 'nav.download'))}</a> <a class="btn" href="${DISCUSSIONS}">${esc(tx(lang, 'foot.discussions'))}</a></p></div>`;
  for (const d of DOC_PAGES) {
    const { title, html } = renderMarkdown(docSource(lang, d.slug), { link: docLink(lang) });
    const path = docHref(lang, d.slug);
    const pageTitle = tx(lang, `doc.${d.slug}.title`);
    const body = `<section class="hero hero-sub"><div class="glow" aria-hidden="true"></div>
        <div class="wrap narrow">
          <p class="crumbs"><a href="${home}">CablePilot</a> › <a href="${DOCS[lang]}">${esc(tx(lang, 'nav.docs'))}</a> › ${esc(pageTitle)}</p>
          <h1>${esc(title || pageTitle)}</h1>
          <p class="lead">${esc(tx(lang, `doc.${d.slug}.description`))}</p>
          ${docNav(d.slug)}
        </div>
      </section>
      <article class="article">
        <div class="wrap narrow">
          ${html}
          ${cta}
        </div>
      </article>`;
    const jsonld = [
      { '@context': 'https://schema.org', '@type': 'TechArticle', headline: title || pageTitle, description: tx(lang, `doc.${d.slug}.description`), inLanguage: lang, url: `${SITE}${path}`, isPartOf: { '@type': 'WebSite', name: 'CablePilot', url: `${SITE}${home}` }, about: { '@type': 'SoftwareApplication', name: 'CablePilot' } },
      crumbsLd([['CablePilot', home], [tx(lang, 'nav.docs'), DOCS[lang]], [pageTitle, path]]),
    ];
    page({ lang, path, alt: docHref(other, d.slug), title: `${pageTitle} · CablePilot`, description: tx(lang, `doc.${d.slug}.description`), body, section: 'docs', jsonld });
  }
  // The docs index.
  const more = [
    [tx(lang, 'docs.more.erp'), `${REPO}/blob/main/docs/erp-link.md`],
    [tx(lang, 'docs.more.layout'), `${REPO}/blob/main/docs/layout-format.md`],
    [tx(lang, 'docs.more.all'), `${REPO}/blob/main/docs/README.md`],
  ];
  const body = `<section class="hero hero-sub"><div class="glow" aria-hidden="true"></div>
        <div class="wrap">
          <p class="crumbs"><a href="${home}">CablePilot</a> › ${esc(tx(lang, 'nav.docs'))}</p>
          <h1>${esc(tx(lang, 'docs.page.h1'))}</h1>
          <p class="lead">${esc(tx(lang, 'docs.lead'))}</p>
        </div>
      </section>
      <section class="band">
        <div class="wrap">
          <div class="grid three">
            ${DOC_PAGES.map((d) => `<a class="card" href="${docHref(lang, d.slug)}"><h2 class="h3">${esc(tx(lang, `doc.${d.slug}.title`))}</h2><p>${esc(tx(lang, `doc.${d.slug}.description`))}</p><span class="more">${esc(tx(lang, 'docs.read'))} →</span></a>`).join('\n            ')}
          </div>
          <h2 class="toc-h">${esc(tx(lang, 'docs.more'))}</h2>
          <ul class="doc-nav">${more.map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul>
        </div>
      </section>`;
  page({ lang, path: DOCS[lang], alt: DOCS[other], title: tx(lang, 'docs.page.title'), description: tx(lang, 'docs.page.description'), body, section: 'docs', jsonld: [crumbsLd([['CablePilot', home], [tx(lang, 'nav.docs'), DOCS[lang]]])] });
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
// The web app manifest: name and icons for "add to home screen" and search engines.
emit(
  'site.webmanifest',
  `${JSON.stringify({ name: 'CablePilot', short_name: 'CablePilot', description: TEXT['home.description'].en, start_url: '/', display: 'browser', background_color: '#0f1419', theme_color: '#0f1419', icons: [192, 512].map((n) => ({ src: `/img/icon-${n}.png`, sizes: `${n}x${n}`, type: 'image/png' })) }, null, 2)}\n`,
);
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
