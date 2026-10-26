#!/usr/bin/env node
// Renders the app icon build/icon.svg to build/icon.png (1024 x 1024), which electron-builder turns into the macOS
// .icns and the Windows .ico. Uses Playwright's Chromium (a dev dependency), so no image tool has to be installed.
//   node scripts/make-icon.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator('svg').screenshot({ path: join(root, 'build', 'icon.png'), omitBackground: true });
await browser.close();
console.log('build/icon.png written');
