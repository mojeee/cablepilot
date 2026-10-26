#!/usr/bin/env node
// Renders the app icon and the website's images with Playwright's Chromium (a dev dependency), so no image tool has to
// be installed:
//   build/icon.png                       1024 x 1024, from build/icon.svg (electron-builder makes the .icns and .ico)
//   site/img/icon-180.png, -192, -512    the website's touch and manifest icons, from the same SVG
//   site/img/og.png, og-it.png           1200 x 630 social cards: the mark, the headline and a real screenshot
//                                        (site/img/app-dark.png, from npm run screenshots)
//   node scripts/make-icon.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { TEXT } from './site/texts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8');
const browser = await chromium.launch();

async function renderSvg(size, out) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('width="1024" height="1024"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.locator('svg').screenshot({ path: out, omitBackground: true });
  await page.close();
}
await renderSvg(1024, join(root, 'build', 'icon.png'));
for (const size of [180, 192, 512]) await renderSvg(size, join(root, 'site', 'img', `icon-${size}.png`));

const shot = join(root, 'site', 'img', 'app-dark.png');
const shotUrl = existsSync(shot) ? `data:image/png;base64,${readFileSync(shot).toString('base64')}` : '';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
for (const [lang, file] of [['en', 'og.png'], ['it', 'og-it.png']]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; width: 1200px; height: 630px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: radial-gradient(700px 420px at 85% 30%, rgba(77,163,255,.22), transparent 70%), radial-gradient(500px 300px at 10% 10%, rgba(92,203,143,.12), transparent 70%), #0f1419; color: #e9edf1; }
    .copy { position: absolute; left: 64px; top: 70px; width: 470px; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 700; margin-bottom: 40px; }
    .brand svg { width: 56px; height: 56px; }
    .eyebrow { font: 600 15px ui-monospace, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: #5ccb8f; margin-bottom: 16px; }
    h1 { font-size: 50px; line-height: 1.06; letter-spacing: -.02em; margin: 0 0 22px; }
    p { font-size: 21px; line-height: 1.4; color: #a7b3bf; margin: 0; }
    .win { position: absolute; left: 570px; top: 96px; width: 760px; border-radius: 14px; overflow: hidden; border: 1px solid #334050; box-shadow: 0 30px 90px rgba(0,0,0,.6); background: #12171c; }
    .bar { height: 26px; background: #161c22; border-bottom: 1px solid #262f39; display: flex; gap: 7px; align-items: center; padding: 0 12px; }
    .bar i { width: 11px; height: 11px; border-radius: 50%; } .bar i:nth-child(1){background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
    .win img { display: block; width: 100%; }
  </style></head><body>
    <div class="copy">
      <div class="brand">${svg.replace('width="1024" height="1024"', '')}CablePilot</div>
      <div class="eyebrow">${esc(TEXT['hero.eyebrow'][lang])}</div>
      <h1>${esc(TEXT['hero.title'][lang])}</h1>
      <p>${esc(TEXT['og.tagline'][lang])}</p>
    </div>
    ${shotUrl ? `<div class="win"><div class="bar"><i></i><i></i><i></i></div><img src="${shotUrl}" alt="" /></div>` : ''}
  </body></html>`);
  await page.screenshot({ path: join(root, 'site', 'img', file) });
  await page.close();
}
await browser.close();
console.log('build/icon.png, site/img/icon-180/192/512.png, site/img/og.png and og-it.png written');
