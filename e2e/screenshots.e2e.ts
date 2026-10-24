// Captures the screenshots of the website from the real built app and the sample projects: dark and
// light, no retouching. Skipped in CI and unless asked for: npm run screenshots (builds first).
// The PNGs are written to site/img/ and committed; npm run build:site shows them on the landing page.
/// <reference lib="dom" />
import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, launch } from './app';

const out = join(__dirname, '..', 'site', 'img');
test.skip(!!process.env.CI || !process.env.CP_SCREENSHOTS, 'run with npm run screenshots (not in CI)');

test('screenshots of the sample projects, dark and light', async () => {
  mkdirSync(out, { recursive: true });
  const { app, page, close } = await launch();
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
    const theme = async (ui: 'dark' | 'light', canvas: 'dark' | 'white') => {
      await page.getByLabel('Theme').selectOption(ui);
      await page.getByLabel('Canvas colour').selectOption(canvas);
    };
    const open = async (id: string) => {
      await page.getByTestId('samples').selectOption(id);
      await expect(page.getByRole('region', { name: 'Messages' })).toContainText('Opened');
    };
    const canvas = () => page.getByTestId('page-canvas');
    const goto = async (text: string) => {
      await page.locator('.page-item', { hasText: text }).first().click();
      await page.waitForTimeout(400);
    };

    // The whole window, conveyor sample, motor power page: dark UI with the dark canvas, then light with white.
    await open('conveyor');
    await goto('Motor power circuit');
    await theme('dark', 'dark');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, 'app-dark.png') });
    await theme('light', 'white');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, 'app-light.png') });

    // The features: schematic, devices and cross-references, reports (dark canvas).
    await open('dc-charger');
    await theme('dark', 'dark');
    await goto('Ingresso e moduli');
    await canvas().screenshot({ path: join(out, 'feat-schematic.png') });
    await goto('Relè di allarme');
    await canvas().screenshot({ path: join(out, 'feat-devices.png') });
    await page.getByTestId('reports').click();
    await page.getByTestId('report-wires').click();
    await page.getByRole('dialog').screenshot({ path: join(out, 'feat-reports.png') });
    await page.keyboard.press('Escape');

    // The drawing set: pages as they print (white).
    await theme('light', 'white');
    for (const [file, title] of [['set-cover', 'Copertina'], ['set-single', 'Schema unifilare'], ['set-multi', 'Ingresso e moduli'], ['set-terminals', 'Schema morsettiere'], ['set-bom', 'Distinta materiali']] as const) {
      await goto(title);
      await canvas().screenshot({ path: join(out, `${file}.png`) });
    }
  } finally {
    await close();
  }
});
