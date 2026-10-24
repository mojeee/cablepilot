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

    // The electrical rule check: the conveyor sample with a duplicate designation (a second coil renamed
    // -KM1), the installation method changed to A1 and the ambient temperature to 45 °C, which makes the
    // 2.5 mm² conductors on the 16 A breaker too small (18 A x 0.79 = 14.2 A).
    await open('conveyor');
    await theme('dark', 'dark');
    await goto('Control circuit');
    const cb = (await canvas().boundingBox())!;
    const at = { x: cb.x + cb.width * 0.88, y: cb.y + cb.height * 0.62 };
    await page.getByTestId('symbol-coil').click();
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(200);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    await page.mouse.click(at.x, at.y + 36);
    await page.getByTestId('prop-designation').fill('-KM1');
    await page.getByTestId('prop-designation').blur();
    await page.getByTestId('settings').click();
    await page.getByTestId('installation-method').selectOption('A1');
    await page.getByTestId('supply-ambient').selectOption('45');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('checks-banner')).toBeVisible();
    await goto('Motor power circuit');
    await page.evaluate(() => document.documentElement.style.setProperty('--messages-h', '230px'));
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, 'feat-checks.png') });
    await page.evaluate(() => document.documentElement.style.removeProperty('--messages-h'));

    // The PLC I/O overview of the conveyor sample's rack.
    await open('conveyor');
    await theme('dark', 'dark');
    await page.getByTestId('plc').click();
    await expect(page.getByTestId('plc-table')).toBeVisible();
    // The top of the window, in the 12:7 shape of the other feature images.
    const bb = (await page.getByRole('dialog').boundingBox())!;
    await page.screenshot({ path: join(out, 'feat-plc.png'), clip: { x: bb.x, y: bb.y, width: bb.width, height: Math.min(bb.height, Math.round((bb.width * 7) / 12)) } });
    await page.keyboard.press('Escape');

    // Sizing: the conveyor sample's motor raised to 7.5 kW on its nameplate, the sample stock list loaded; the review
    // table proposes a contactor and an overload relay from stock, and the suggestion panel of the contactor is open.
    await open('conveyor');
    await theme('dark', 'dark');
    await page.getByTestId('warehouse').click();
    await page.getByTestId('wh-sample').click();
    await expect(page.getByTestId('wh-table')).toBeVisible();
    await page.keyboard.press('Escape');
    await goto('Motor power circuit');
    await page.keyboard.press('f');
    const cv = (await canvas().boundingBox())!;
    const zoom = Number(/Zoom\s+(\d+)\s*%/.exec(await page.locator('body').innerText())![1]) / 100;
    await page.mouse.click(cv.x + cv.width / 2, cv.y + cv.height / 2 + (234 - 148.5) * zoom);
    await page.getByTestId('load-power').fill('7.5');
    await page.getByTestId('load-power').blur();
    await page.getByTestId('device-sizing').click();
    await page.locator('[data-testid="sizing-line"][data-role="contactor"]').getByTestId('sizing-choose').click();
    await expect(page.getByTestId('sizing-panel')).toBeVisible();
    await page.locator('.modal-body').evaluate((el) => { el.scrollTop = 112; });
    const sb = (await page.getByRole('dialog').boundingBox())!;
    await page.screenshot({ path: join(out, 'feat-sizing.png'), clip: { x: sb.x, y: sb.y, width: sb.width, height: Math.min(sb.height, Math.round((sb.width * 7) / 12)) } });
    await page.keyboard.press('Escape');

    // The drawing set: pages as they print (white), from the charger sample.
    await open('dc-charger');
    await theme('light', 'white');
    for (const [file, title] of [['set-cover', 'Copertina'], ['set-single', 'Schema unifilare'], ['set-multi', 'Ingresso e moduli'], ['set-terminals', 'Schema morsettiere'], ['set-bom', 'Distinta materiali']] as const) {
      await goto(title);
      await canvas().screenshot({ path: join(out, `${file}.png`) });
    }
  } finally {
    await close();
  }
});
