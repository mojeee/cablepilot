#!/usr/bin/env node
// Renders the images the battery-charger sample uses, from SVG drawn here, with Playwright's Chromium:
//   samples/assets/logo-esempio.png   the title-block logo of the fictional client company
//   samples/assets/hmi-front.png      a front-view illustration of the generic 7" HMI panel (not a photo of a product)
// Both are our own drawings: nothing from a third party. tests/support/samples.ts embeds them in the sample project.
//   node scripts/make-sample-assets.mjs
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'samples', 'assets');
mkdirSync(out, { recursive: true });

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180">
  <rect x="10" y="20" width="140" height="140" rx="22" fill="#1f4e79"/>
  <path d="M40 120V60h80M40 90h60M40 120h80" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round"/>
  <text x="175" y="98" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="700" fill="#1f4e79">ESEMPIO</text>
  <text x="178" y="140" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#4a5662">Quadri elettrici S.r.l.</text>
</svg>`;

const HMI = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">
  <rect width="480" height="320" fill="#ffffff"/>
  <rect x="30" y="30" width="420" height="260" rx="14" fill="#2b3036"/>
  <rect x="58" y="52" width="364" height="216" rx="4" fill="#0f2233"/>
  <rect x="58" y="52" width="364" height="34" fill="#1d4e7a"/>
  <text x="74" y="76" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#fff">Caricabatterie 110 V DC</text>
  <g font-family="Helvetica, Arial, sans-serif" fill="#cfe3f5">
    <text x="76" y="122" font-size="15">Tensione batteria</text><text x="300" y="122" font-size="22" font-weight="700" fill="#7fe0a6">110.4 V</text>
    <text x="76" y="162" font-size="15">Corrente di uscita</text><text x="300" y="162" font-size="22" font-weight="700" fill="#7fe0a6">18.2 A</text>
    <text x="76" y="202" font-size="15">Stato rete</text><text x="300" y="202" font-size="18" font-weight="700" fill="#7fe0a6">OK</text>
  </g>
  <rect x="76" y="222" width="100" height="30" rx="5" fill="#2f6f53"/><text x="96" y="243" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#fff">Allarmi</text>
  <rect x="188" y="222" width="100" height="30" rx="5" fill="#3a4654"/><text x="204" y="243" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#fff">Storico</text>
  <circle cx="240" cy="279" r="4" fill="#5ccb8f"/>
</svg>`;

const browser = await chromium.launch();
for (const [svg, w, h, file] of [[LOGO, 600, 180, 'logo-esempio.png'], [HMI, 480, 320, 'hmi-front.png']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: join(out, file), omitBackground: file.startsWith('logo') });
  await page.close();
}
await browser.close();
console.log('samples/assets/logo-esempio.png and hmi-front.png written');
