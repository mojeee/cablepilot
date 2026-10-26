// Helpers for recording the website's short clips from the real app (e2e/clips.e2e.ts): a visible pointer with a ring
// on every click, eased pointer moves, zooming at a point, and the caption bar drawn on top of the window so the
// captions are part of the video (they work with the sound off and in every player). Nothing in the app is changed:
// the overlay is plain DOM on top, ignored by the pointer.
/// <reference lib="dom" />
import type { Locator, Page } from '@playwright/test';

export function recorder(page: Page, opts: { title: string; brand?: string }) {
  let cur = { x: 1500, y: 1000 };
  const wait = (ms: number) => page.waitForTimeout(ms);

  const install = () =>
    page.evaluate(({ title, brand }) => {
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
      // The caption: a lower third above the command line, large enough to read at 720p, with the clip's title as
      // a small line above the text (so nothing covers the ribbon or the panels).
      const bar = document.createElement('div');
      bar.id = 'cp-clip-caption';
      bar.style.cssText = 'position:fixed;left:50%;bottom:150px;transform:translateX(-50%) translateY(12px);width:max-content;max-width:1640px;padding:14px 32px 18px;border-radius:14px;background:rgba(10,14,20,.92);color:#fff;font:600 36px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.5);border:1.5px solid rgba(77,163,255,.55);z-index:2147483645;pointer-events:none;opacity:0;transition:opacity .25s ease,transform .25s ease';
      const kicker = document.createElement('div');
      kicker.style.cssText = 'font:600 17px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#4da3ff;margin-bottom:6px';
      kicker.textContent = `${brand} · ${title}`;
      const text = document.createElement('div');
      text.id = 'cp-clip-caption-text';
      bar.append(kicker, text);
      document.body.appendChild(bar);
    }, { title: opts.title, brand: opts.brand ?? 'CablePilot' });

  /**
   * A sync frame: the whole window turns magenta for a moment. Returns the wall-clock time it was on screen; the encoders
   * (scripts/video-sync.mjs) find the first magenta frame in the recording, so every mark is placed exactly, however
   * long Playwright takes to finish the file.
   */
  const sync = async (): Promise<number> => {
    const at = await page.evaluate(() => new Promise<number>((resolve) => {
      const f = document.createElement('div');
      f.id = 'cp-sync';
      f.style.cssText = 'position:fixed;inset:0;background:#ff00ff;z-index:2147483647;pointer-events:none';
      document.body.appendChild(f);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(Date.now())));
    }));
    await wait(400);
    await page.evaluate(() => document.getElementById('cp-sync')?.remove());
    await wait(200);
    return at;
  };
  /** Shows a caption (null hides it); `top` moves it up when the lower part of the window matters. */
  const say = (text: string | null, top = false) =>
    page.evaluate(({ text, top }) => {
      const bar = document.getElementById('cp-clip-caption') as HTMLDivElement;
      if (!text) { bar.style.opacity = '0'; return; }
      (document.getElementById('cp-clip-caption-text') as HTMLDivElement).textContent = text;
      bar.style.bottom = top ? '' : '150px';
      bar.style.top = top ? '150px' : '';
      bar.style.opacity = '1';
      bar.style.transform = 'translateX(-50%) translateY(0)';
    }, { text, top });

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
  /** Moves the pointer onto an element without clicking, to show it. */
  const hover = async (loc: Locator, ms = 600) => {
    const p = await centre(loc);
    await glide(p.x, p.y, ms);
  };
  const clickOn = async (loc: Locator, ms = 700) => {
    const p = await centre(loc);
    await glide(p.x, p.y, ms);
    await wait(150);
    await page.mouse.click(p.x, p.y);
  };
  const clickAt = async (x: number, y: number, ms = 700) => {
    await glide(x, y, ms);
    await wait(130);
    await page.mouse.click(x, y);
  };
  const typeInto = async (loc: Locator, text: string, tab = true, delay = 80) => {
    await clickOn(loc, 550);
    await loc.fill('');
    await loc.pressSequentially(text, { delay });
    await wait(220);
    if (tab) await loc.press('Tab');
  };
  /** Zoom the canvas at a point, a notch at a time (the app zooms by 1.1 per wheel step). */
  const zoomAt = async (x: number, y: number, notches: number) => {
    await glide(x, y, 600);
    for (let i = 0; i < notches; i++) {
      await page.mouse.wheel(0, -100);
      await wait(55);
    }
  };
  /** "Fit page" from the status bar: a key press could land in a text field that still has the focus. */
  const fit = async () => {
    await page.getByTestId('fit-page').click();
    await wait(300);
  };
  const gotoPage = async (n: number, hold = 900) => {
    await clickOn(page.getByTestId(`page-${n}`), 450);
    await wait(hold);
  };
  /** Page millimetres to screen pixels: an A3 landscape sheet at "Fit page", or a view centred on `centre` (after ZOOM). */
  const mm = async (x: number, y: number, centre = { x: 210, y: 148.5 }) => {
    const b = (await page.getByTestId('page-canvas').boundingBox())!;
    const zoom = Number(/Zoom\s+(\d+)\s*%/.exec(await page.locator('body').innerText())![1]) / 100;
    return { x: b.x + b.width / 2 + (x - centre.x) * zoom, y: b.y + b.height / 2 + (y - centre.y) * zoom };
  };
  /**
   * The page-millimetre to screen mapping of the current view, measured from the status bar's coordinate readout at two
   * points (works at any zoom and pan, e.g. after ZOOM with a window).
   */
  const calibrate = async () => {
    const b = (await page.getByTestId('page-canvas').boundingBox())!;
    const read = async (x: number, y: number) => {
      await page.mouse.move(x, y);
      await wait(120);
      const m = /(-?[\d.]+),\s*(-?[\d.]+)\s*mm/.exec(await page.getByTestId('readout').innerText())!;
      return { x: Number(m[1]), y: Number(m[2]) };
    };
    const p1 = { x: b.x + b.width * 0.25, y: b.y + b.height * 0.25 }, p2 = { x: b.x + b.width * 0.75, y: b.y + b.height * 0.75 };
    const m1 = await read(p1.x, p1.y), m2 = await read(p2.x, p2.y);
    cur = p2;
    const kx = (p2.x - p1.x) / (m2.x - m1.x), ky = (p2.y - p1.y) / (m2.y - m1.y);
    return (x: number, y: number) => ({ x: p1.x + (x - m1.x) * kx, y: p1.y + (y - m1.y) * ky });
  };
  return { install, sync, say, calibrate, wait, glide, centre, hover, clickOn, clickAt, typeInto, zoomAt, fit, gotoPage, mm };
}
