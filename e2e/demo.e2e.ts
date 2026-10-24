// Records the website's demo video from the real built app: Playwright's recordVideo at 1920 x 1080
// drives the DC battery-charger sample through the story (docs/demo.md) with deliberate pauses, a
// visible pointer and zoom-ins on the area that changes. Nothing is faked: every pixel is the app.
// Skipped in CI and unless asked for: npm run record:demo (builds, records, encodes, rebuilds the site).
// Output: out/demo-video/demo-raw.webm and marks.json (when each caption starts); scripts/demo-video.mjs
// turns them into site/video/*.
/// <reference lib="dom" />
import { test, type Locator } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, launch } from './app';

test.skip(!!process.env.CI || !process.env.CP_DEMO, 'run with npm run record:demo (not in CI)');

const W = 1920;
const H = 1080;
const outDir = join(__dirname, '..', 'out', 'demo-video');
const captions = JSON.parse(readFileSync(join(__dirname, 'demo-captions.json'), 'utf8')) as { id: string }[];

test('demo recording: the battery-charger story', async () => {
  test.setTimeout(10 * 60_000);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const { app, page, out, close } = await launch({ recordVideo: { dir: join(outDir, 'raw'), size: { width: W, height: H } } });
  const marks: Record<string, number> = {};
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1920, 1080));
    await page.setViewportSize({ width: W, height: H });
    const messages = page.getByRole('region', { name: 'Messages' });
    const canvas = page.getByTestId('page-canvas');
    let cur = { x: 1500, y: 1000 };

    // ---- the visible pointer: a dot that follows the real mouse, with a ring on every click ----
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(255,196,0,.9);border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.45),0 2px 10px rgba(0,0,0,.5);z-index:2147483647;pointer-events:none;transform:translate(1500px,1000px)';
      document.body.appendChild(d);
      window.addEventListener('mousemove', (e) => { d.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
      window.addEventListener('mousedown', (e) => {
        const r = document.createElement('div');
        r.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid rgba(255,196,0,.95);z-index:2147483646;pointer-events:none`;
        document.body.appendChild(r);
        r.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(3.2)', opacity: 0 }], { duration: 550, easing: 'ease-out' }).onfinish = () => r.remove();
      }, true);
    });

    const wait = (ms: number) => page.waitForTimeout(ms);
    const cue = async (id: string) => {
      marks[id] = Date.now();
    };
    /** Eased pointer move, so the viewer can follow it. */
    const glide = async (x: number, y: number, ms = 550) => {
      const n = Math.max(10, Math.round(ms / 20));
      const from = cur;
      for (let i = 1; i <= n; i++) {
        const k = i / n;
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
        await wait(ms / n / 2);
      }
      cur = { x, y };
    };
    const centre = async (loc: Locator) => {
      await loc.scrollIntoViewIfNeeded();
      const b = (await loc.boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const clickOn = async (loc: Locator, ms = 750) => {
      const p = await centre(loc);
      await glide(p.x, p.y, ms);
      await wait(160);
      await page.mouse.click(p.x, p.y);
    };
    const clickAt = async (x: number, y: number, ms = 750) => {
      await glide(x, y, ms);
      await wait(140);
      await page.mouse.click(x, y);
    };
    const typeInto = async (loc: Locator, text: string, tab = true) => {
      await clickOn(loc, 600);
      await loc.fill('');
      await loc.pressSequentially(text, { delay: 90 });
      await wait(250);
      if (tab) await loc.press('Tab');
    };
    /** Zoom the canvas at the pointer, a notch at a time (the app zooms by 1.1 per wheel step). */
    const zoomAt = async (x: number, y: number, notches: number) => {
      await glide(x, y, 650);
      for (let i = 0; i < notches; i++) {
        await page.mouse.wheel(0, -100);
        await wait(55);
      }
    };
    const zoomOut = async (notches: number) => {
      for (let i = 0; i < notches; i++) {
        await page.mouse.wheel(0, 100);
        await wait(55);
      }
    };
    const fit = async () => {
      await page.keyboard.press('f');
      await wait(300);
    };
    const gotoPage = async (n: number, hold = 1300) => {
      await clickOn(page.getByTestId(`page-${n}`), 450);
      await wait(hold);
    };
    // The sheet is centred in the canvas at "Fit page": millimetres to screen pixels (1 % zoom = 0.01 px/mm).
    const mm = async (x: number, y: number) => {
      const b = (await canvas.boundingBox())!;
      const zoom = Number(/Zoom\s+(\d+)\s*%/.exec(await page.locator('body').innerText())![1]) / 100;
      return { x: b.x + b.width / 2 + (x - 210) * zoom, y: b.y + b.height / 2 + (y - 148.5) * zoom };
    };

    // ============ 1. Open the sample, the cover, the drawing set ============
    await wait(1200);
    await cue('open');
    await glide(700, 22, 900);
    await wait(500);
    await page.getByTestId('samples').selectOption('dc-charger');
    await expect(messages).toContainText('Opened');
    await wait(3200);

    await cue('flick');
    await gotoPage(2, 1300);
    await gotoPage(5, 1500);
    await gotoPage(9, 1500);
    await gotoPage(10, 1500);
    await gotoPage(16, 1500);

    // ============ 2. A coil and a contact from the library, on the control page ============
    await gotoPage(8, 1500);
    await cue('coil');
    await typeInto(page.getByTestId('symbol-search'), 'coil', false);
    await wait(500);
    const coilAt = await mm(250, 100);
    await clickOn(page.getByTestId('symbol-coil'), 700);
    await wait(500);
    await clickAt(coilAt.x, coilAt.y, 800);
    await expect(messages).toContainText(/Placed -K\d+/);
    const dsg = /Placed (-K\d+)/.exec(await messages.innerText())![1];
    await page.keyboard.press('Escape');
    await wait(1100);
    await zoomAt(coilAt.x, coilAt.y, 9);
    await wait(2000);
    await fit();
    await wait(600);

    await cue('contact');
    await typeInto(page.getByTestId('symbol-search'), 'contact', false);
    await wait(400);
    const contactAt = await mm(250, 178);
    await clickOn(page.getByTestId('symbol-contact-no'), 700);
    await clickAt(contactAt.x, contactAt.y, 800);
    await page.keyboard.press('Escape');
    await wait(300);
    await clickAt(contactAt.x, contactAt.y, 400);
    await typeInto(page.getByTestId('prop-designation'), dsg, true);
    await expect(page.getByTestId('device-reps')).toContainText('Coil');
    await wait(500);
    await clickOn(page.getByTestId('device-reps').locator('li').first(), 600);
    await wait(600);
    await zoomAt(coilAt.x, (coilAt.y + contactAt.y) / 2, 6);
    await wait(2000);
    await fit();
    // select the contact again to keep the Properties panel on the device
    await clickAt(contactAt.x, contactAt.y, 700);

    await cue('part');
    await clickOn(page.getByTestId('part-select'), 700);
    await page.getByTestId('part-select').selectOption('generic-contactor-9a');
    await wait(500);
    await clickOn(page.getByTestId('part-add'), 500);
    await expect(page.getByTestId('device-parts')).toContainText('GEN-CONTACTOR-9A');
    await wait(1800);
    await page.keyboard.press('Escape');

    // ============ 3. Wire numbers, colours, a bundle ============
    await cue('number');
    await clickOn(page.getByTestId('wires'), 800);
    await wait(900);
    await typeInto(page.getByLabel('Start at'), '20', true);
    await wait(700);
    await clickOn(page.getByTestId('wires-number-now'), 700);
    await expect(messages).toContainText('Wires numbered.');
    await wait(1800);
    await clickOn(page.getByTestId('wires-tab-classes'), 700);
    await wait(2000);
    await page.keyboard.press('Escape');
    await wait(500);
    await gotoPage(6, 1200);

    await cue('colours');
    const dc = await mm(250, 222);
    await zoomAt(dc.x, dc.y, 10);
    await wait(1800);
    await fit();
    await wait(400);
    const bundleAt = await mm(200, 222);
    await clickAt(bundleAt.x, bundleAt.y, 800);
    await clickOn(page.getByLabel('Bundle of wires (one label)'), 700);
    await wait(500);
    await zoomAt(bundleAt.x, bundleAt.y, 9);
    await wait(2200);
    await fit();
    await page.keyboard.press('Escape');

    // ============ 4. Reports window, live ============
    await cue('terminals');
    await clickOn(page.getByTestId('reports'), 800);
    await clickOn(page.getByTestId('report-terminals'), 600);
    await wait(2600);
    await cue('wirelist');
    await clickOn(page.getByTestId('report-wires'), 600);
    await expect(page.getByTestId('report-table')).toContainText('020');
    await wait(2600);
    await cue('bom');
    await clickOn(page.getByTestId('report-bom'), 600);
    await wait(900);
    const row = page.getByTestId('report-table').locator('tr', { hasText: dsg }).first();
    await expect(row).toContainText('GEN-CONTACTOR-9A');
    const rp = await centre(row);
    await glide(rp.x, rp.y, 700);
    await wait(2800);
    await page.keyboard.press('Escape');
    await wait(500);

    // ============ 5. Print preview, PDF, XLSX, the cover ============
    await cue('print');
    await gotoPage(6, 600);
    await clickOn(page.getByTestId('print-preview'), 800);
    await wait(3000);
    await clickOn(page.getByTestId('print-preview'), 700);
    await wait(500);

    await cue('pdf');
    await clickOn(page.getByTestId('export-pdf'), 800);
    await expect(messages).toContainText('PDF exported');
    await wait(2000);
    await cue('xlsx');
    await clickOn(page.getByTestId('reports'), 700);
    await clickOn(page.getByTestId('export-xlsx'), 700);
    await expect(messages).toContainText('Lists exported');
    await wait(2000);
    await page.keyboard.press('Escape');
    await wait(400);
    await gotoPage(1, 600);
    await cue('end');
    await glide(1500, 1000, 800);
    await wait(3500);
    expect(readdirSync(out).some((f) => f.endsWith('.pdf'))).toBe(true);
    marks.__end = Date.now();
  } finally {
    const video = page.video();
    await close();
    const path = video ? await video.path() : '';
    if (path) copyFileSync(path, join(outDir, 'demo-raw.webm'));
    writeFileSync(join(outDir, 'marks.json'), JSON.stringify({ marks, order: captions.map((c) => c.id) }, null, 2));
  }
});
