// End-to-end test of the panel designer features (M8 part 2): a contact placed on a wire cuts it (one undo step),
// auto-wire connects two selected symbols, LADDER turns the page into a ladder page with numbered rungs, and the
// project history saves a version, compares it with the working copy and restores it as one undo step.
/// <reference lib="dom" />
import { test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, launch, tab } from './app';

interface Saved { pages: { type: string; ladder?: { first: number }; elements: { kind: string; id: string; symbolId?: string; x?: number; y?: number; points?: { x: number; y: number }[] }[] }[] }

async function cmd(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('cmd-input');
  await input.click();
  await input.fill(text);
  await input.press('Enter');
}

/** Maps page millimetres to screen pixels by reading the coordinate readout at two points (snap off, so the readout is exact). */
async function calibrate(page: Page) {
  const box = (await page.getByTestId('page-canvas').boundingBox())!;
  const read = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    const m = (await page.getByTestId('readout').textContent())!.match(/(-?\d+\.\d), (-?\d+\.\d) mm/)!;
    return { x: Number(m[1]), y: Number(m[2]) };
  };
  await page.keyboard.press('F9');
  const a = await read(box.x + 200, box.y + 150), b = await read(box.x + 600, box.y + 400);
  await page.keyboard.press('F9');
  const sx = 400 / (b.x - a.x), sy = 250 / (b.y - a.y);
  return (px: number, py: number) => ({ x: box.x + 200 + (px - a.x) * sx, y: box.y + 150 + (py - a.y) * sy });
}

test('insert on a wire, auto-wire, ladder page, project history', async () => {
  const { page, out, close } = await launch();
  try {
    const messages = page.getByRole('region', { name: 'Messages' });
    const at = await calibrate(page);
    const click = async (x: number, y: number) => { const p = at(x, y); await page.mouse.click(p.x, p.y); };
    const saved = async (): Promise<Saved> => {
      await page.getByTestId('save').click();
      await expect(messages).toContainText('Saved');
      const file = readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))!;
      return JSON.parse(readFileSync(join(out, file), 'utf8')) as Saved;
    };
    // The starter project opens on its power page.
    const power = (x: Saved) => x.pages.find((pg) => pg.type === 'power')!;
    const wires = (x: Saved) => power(x).elements.filter((e) => e.kind === 'wire');
    /** The outer end of piece i of the cut wire (its start for the first piece, its end for the second). */
    const w0 = (x: Saved, i: number) => { const pts = wires(x)[i].points!; return i === 0 ? pts[0] : pts[pts.length - 1]; };

    // A vertical wire, then a normally open contact dropped onto its middle: the wire is cut on both sides of it.
    await page.keyboard.press('w');
    await click(200, 60);
    await click(200, 140);
    await page.keyboard.press('Enter');
    await expect(messages).toContainText('Wire drawn.');
    await page.keyboard.press('Escape');
    await page.getByTestId('symbol-contact-no').click();
    await click(200, 100);
    await page.keyboard.press('Escape');
    let s = await saved();
    const k = power(s).elements.find((e) => e.kind === 'symbol')!;
    // Two pieces of the wire, ending on the contact's pins 5 mm above and below its centre.
    expect(wires(s).map((w) => w.points)).toEqual([[w0(s, 0), { x: k.x, y: k.y! - 5 }], [{ x: k.x, y: k.y! + 5 }, w0(s, 1)]]);
    // Placing and cutting was one step.
    await page.keyboard.press('Control+z');
    s = await saved();
    expect(wires(s)).toHaveLength(1);
    expect(power(s).elements.filter((e) => e.kind === 'symbol')).toHaveLength(0);
    await page.keyboard.press('Control+Shift+z');

    // Auto-wire: a coil above a contact, selected with a window, connected by AW.
    await page.getByTestId('symbol-coil').click();
    await click(260, 80);
    await page.keyboard.press('Escape');
    await page.getByTestId('symbol-contact-no').click();
    await click(260, 120);
    await page.keyboard.press('Escape');
    const a = at(240, 65), b = at(285, 135);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await cmd(page, 'AW');
    await expect(page.getByTestId('cmd-log')).toContainText('Auto-wire: wires drawn: 1.');
    s = await saved();
    const coil = power(s).elements.find((e) => e.symbolId === 'coil')!;
    const below = power(s).elements.filter((e) => e.symbolId === 'contact-no').find((e) => e.x === coil.x)!;
    expect(wires(s).some((w) => JSON.stringify(w.points) === JSON.stringify([{ x: coil.x, y: coil.y! + 5 }, { x: below.x, y: below.y! - 5 }]))).toBe(true);

    // Ladder page: rails drawn as wires, line numbers from page × 100.
    await tab(page, 'insert');
    await page.getByTestId('rb-ladder').click();
    await expect(page.getByTestId('cmd-log')).toContainText('This page is a ladder page');
    s = await saved();
    expect(power(s).ladder?.first).toBe((s.pages.indexOf(power(s)) + 1) * 100);
    expect(wires(s).filter((w) => w.id.includes('-rail-'))).toHaveLength(2);

    // Project history: save a version, change the project, compare, restore, undo the restore.
    await tab(page, 'reports');
    await page.getByTestId('rb-history').click();
    await page.getByTestId('hist-name').fill('Before the lamp');
    await page.getByTestId('hist-save').click();
    await expect(messages).toContainText('Version "Before the lamp" saved.');
    await expect(page.locator('[data-testid="hist-table"] tbody tr[data-kind="version"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.getByTestId('symbol-lamp').click();
    await click(330, 100);
    await page.keyboard.press('Escape');
    await page.getByTestId('rb-history').click();
    await page.locator('[data-testid="hist-table"] tbody tr[data-kind="version"]').getByTestId('hist-open').click();
    await expect(page.getByTestId('hist-devices')).toContainText('added');
    await page.getByTestId('hist-restore').click();
    await expect(messages).toContainText('Restored Before the lamp.');
    const symbols = (x: Saved) => power(x).elements.filter((e) => e.kind === 'symbol').length;
    expect(symbols(await saved())).toBe(3);
    await page.keyboard.press('Control+z');
    expect(symbols(await saved())).toBe(4);
  } finally {
    await close();
  }
});
