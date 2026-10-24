// End-to-end test of the cabinet layout (M6 part 3): draw an enclosure, plate and rail with the CAD tools, place a
// device that snaps to the rail, accept a suggested layout around it, move and lock items and suggest again, import a
// changed layout file as a preview, open the 3D view and export the drilling DXF.
/// <reference lib="dom" />
import { test } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, launch, tab } from './app';

interface Cab { id: string; kind: string; item?: string; x: number; y: number; w: number; h: number; d?: number; designation?: string; rail?: string; auto?: boolean; locked?: boolean }
interface Saved { pages: { id: string; type: string; layout?: { view: string }; elements: Cab[] }[] }
const saved = (out: string): Saved => JSON.parse(readFileSync(join(out, readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))!), 'utf8'));
const front = (s: Saved) => s.pages.find((p) => p.layout?.view === 'front')!;

async function cmd(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('cmd-input');
  await input.click();
  await input.fill(text);
  await input.press('Enter');
}
async function save(page: Page, out: string): Promise<Saved> {
  await page.getByTestId('save').click();
  await expect(page.getByTestId('project-name')).not.toContainText('*');
  return saved(out);
}
async function openLayoutWindow(page: Page, tabId: string): Promise<void> {
  await tab(page, 'layout');
  await page.getByTestId('rb-layout').click();
  await page.getByTestId(`layout-tab-${tabId}`).click();
}

test('cabinet layout: draw plate and rail, place a device, accept a suggestion, edit and suggest again, import, 3D, drilling DXF', async () => {
  test.setTimeout(240_000);
  const { page, out, close } = await launch();
  try {
    await page.getByTestId('samples').selectOption('pump-station');
    await page.locator('.page-item', { hasText: 'Cabinet layout, mounting plate' }).first().click();
    await expect(page.getByTestId('page-canvas')).toBeVisible();

    // The sample ships with a complete layout: nothing is left to place.
    await openLayoutWindow(page, 'devices');
    await expect(page.getByTestId('all-placed')).toBeVisible();
    await page.keyboard.press('Escape');

    // Start from an empty plate: erase everything on the front view. Every device is now "not yet placed".
    await cmd(page, 'SELECTALL');
    await cmd(page, 'ERASE');
    await openLayoutWindow(page, 'devices');
    await expect(page.getByTestId('unplaced').locator('tbody tr')).toHaveCount(16);
    await page.keyboard.press('Escape');

    // Draw with the workspace tools: the enclosure from the library by its size, the plate, a DIN rail by typed coordinates.
    await cmd(page, 'ENCLOSURE 800x1200x400');
    await expect(page.getByTestId('cmd-prompt')).toContainText('top-left corner');
    await cmd(page, '120,100');
    await cmd(page, 'PLATE 700x1100');
    await cmd(page, 'RAIL');
    await cmd(page, '200,300');
    await cmd(page, '800,300');
    let s = await save(page, out);
    const items = front(s).elements.filter((e) => e.kind === 'cab');
    expect(items.find((e) => e.item === 'enclosure')).toMatchObject({ x: 120, y: 100, w: 800, h: 1200, d: 400 });
    expect(items.find((e) => e.item === 'plate')).toMatchObject({ x: 170, y: 150, w: 700, h: 1100 });
    const rail = items.find((e) => e.item === 'rail')!;
    expect(rail).toMatchObject({ x: 200, y: 282.5, w: 600, h: 35 });

    // Place a contactor near the rail: it snaps onto it (its centre goes on the rail's centre line).
    await cmd(page, 'PLACE KM1');
    await expect(page.getByTestId('cmd-prompt')).toContainText('KM1');
    await cmd(page, '300,262');
    await page.getByTestId('cmd-input').press('Escape');
    s = await save(page, out);
    const km1 = front(s).elements.find((e) => e.item === 'device' && e.designation?.endsWith('-KM1'))!;
    expect(km1.rail).toBe(rail.id);
    expect(km1.y + km1.h / 2).toBeCloseTo(300, 5);
    const km1At = { x: km1.x, y: km1.y };

    // Suggest the rest as a preview, accept it: everything is placed, the device placed by hand stays where it is.
    await openLayoutWindow(page, 'suggestion');
    await expect(page.getByTestId('layout-rules')).toContainText('IEC 60715');
    await page.getByTestId('suggest-layout').click();
    await expect(page.getByTestId('chat-proposal').last()).toBeVisible();
    await page.getByTestId('chat-accept').click();
    s = await save(page, out);
    const placed = front(s).elements.filter((e) => e.item === 'device');
    const doorDevices = s.pages.filter((p) => p.layout?.view === 'door').flatMap((p) => p.elements).filter((e) => e.item === 'device');
    expect(placed.length + doorDevices.length).toBe(16);
    expect(placed.find((e) => e.designation?.endsWith('-KM1'))).toMatchObject(km1At);
    await openLayoutWindow(page, 'devices');
    await expect(page.getByTestId('all-placed')).toBeVisible();
    await expect(page.getByTestId('layout-issues')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Edit: move a device by typed coordinates (MOVE with a selection), lock another, suggest again: both stay.
    const target = placed.find((e) => e.designation?.endsWith('-KT1'))!;
    const pick = async (el: Cab) => {
      // Select through the page: SELECTALL then keep only this one is awkward; click it via the canvas readout calibration.
      const box = (await page.getByTestId('page-canvas').boundingBox())!;
      await page.keyboard.press('F9');
      const read = async (x: number, y: number) => { await page.mouse.move(x, y); const m = (await page.getByTestId('readout').textContent())!.match(/(-?\d+\.\d), (-?\d+\.\d) mm/)!; return { x: Number(m[1]), y: Number(m[2]) }; };
      const a = await read(box.x + 200, box.y + 150), b = await read(box.x + 600, box.y + 400);
      await page.keyboard.press('F9');
      const px = box.x + 200 + (el.x + el.w / 2 - a.x) * (400 / (b.x - a.x)), py = box.y + 150 + (el.y + el.h / 2 - a.y) * (250 / (b.y - a.y));
      await page.mouse.click(px, py);
    };
    await cmd(page, 'ZE');
    await page.getByTestId('cmd-input').press('Escape');
    await pick(target);
    await expect(page.getByTestId('prop-cab-designation')).toContainText('KT1');
    await page.getByTestId('prop-cab-locked').check();
    const other = placed.find((e) => e.designation?.endsWith('-KM4'))!;
    await page.getByTestId('cmd-input').press('Escape');
    await pick(other);
    await expect(page.getByTestId('prop-cab-designation')).toContainText('KM4');
    await cmd(page, 'M');
    await cmd(page, '0,0');
    await cmd(page, '@0,0.5');
    s = await save(page, out);
    const movedKm4 = front(s).elements.find((e) => e.designation?.endsWith('-KM4'))!;
    expect(movedKm4.auto).toBeUndefined();
    await openLayoutWindow(page, 'suggestion');
    await page.getByTestId('suggest-layout').click();
    await page.getByTestId('chat-accept').click();
    s = await save(page, out);
    const again = front(s).elements.filter((e) => e.item === 'device');
    expect(again.find((e) => e.designation?.endsWith('-KT1'))).toMatchObject({ x: target.x, y: target.y, locked: true });
    expect(again.find((e) => e.designation?.endsWith('-KM4'))).toMatchObject({ x: movedKm4.x, y: movedKm4.y });

    // Exchange: export JSON, change a position in the file, import it: a preview, then Accept (one undo step).
    await openLayoutWindow(page, 'exchange');
    await page.getByTestId('export-layout-json').click();
    await page.getByTestId('export-layout-csv').click();
    const file = readdirSync(out).find((f) => f.endsWith('-layout.json'))!;
    expect(readdirSync(out).some((f) => f.endsWith('-layout.csv'))).toBe(true);
    const lay = JSON.parse(readFileSync(join(out, file), 'utf8')) as { format: string; version: number; items: { type: string; designation: string; x: number }[] };
    expect(lay.format).toBe('cablepilot-layout');
    const dev = lay.items.find((i) => i.type === 'device' && i.designation.endsWith('-KM4'))!;
    dev.x += 25;
    writeFileSync(join(out, 'layout-import.json'), JSON.stringify(lay));
    await page.getByTestId('import-layout').click();
    await expect(page.getByTestId('chat-proposal').last()).toBeVisible();
    await page.getByTestId('chat-accept').click();
    s = await save(page, out);
    expect(front(s).elements.find((e) => e.designation?.endsWith('-KM4'))!.x).toBeCloseTo(movedKm4.x + 25, 5);
    await page.getByTestId('undo').click();
    s = await save(page, out);
    expect(front(s).elements.find((e) => e.designation?.endsWith('-KM4'))!.x).toBeCloseTo(movedKm4.x, 5);

    // The 3D view loads on demand and draws the devices as boxes.
    await tab(page, 'layout');
    await page.getByTestId('rb-3d').click();
    await expect(page.getByTestId('cabinet-3d').locator('canvas')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __cabinet3dReady?: boolean }).__cabinet3dReady === true)).toBe(true);
    await page.keyboard.press('Escape');

    // The mounting-plate DXF for drilling.
    await openLayoutWindow(page, 'exchange');
    await page.getByTestId('export-drilling-dxf').click();
    const drill = readdirSync(out).find((f) => f.endsWith('-drilling.dxf'))!;
    const dxf = readFileSync(join(out, drill), 'utf8');
    expect(dxf).toContain('\r\nCIRCLE\r\n');
    expect(dxf).toContain('DRILL_RAIL');
    mkdirSync(out, { recursive: true });
  } finally {
    await close();
  }
});
