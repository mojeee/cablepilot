// End-to-end tests of the main workflows not covered elsewhere: black boxes and connectors with a ribbon
// cable in the cable list, macros saved to the company library and placed again, DXF out and back in,
// report pages and the nameplate list, project data in the title block, and single-line and data pages.
/// <reference lib="dom" />
import { test } from '@playwright/test';
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, launch, tab } from './app';

interface El { id: string; kind: string; text?: string; symbolId?: string; variant?: string; designation?: string; x?: number; y?: number; pins?: { id: string }[]; report?: string; items?: unknown[] }
interface Saved {
  properties: Record<string, string>;
  assembly: Record<string, string>;
  cables: { id: string; kind: string; from?: string; to?: string }[];
  pages: { type: string; title: Record<string, string>; elements: El[] }[];
}

/** Saves the project and reads the saved file back from the output folder (the old copy is removed first, so the read waits for this save). */
async function save(page: Page, out: string): Promise<Saved> {
  const project = () => readdirSync(out).find((f) => f.endsWith('.cablepilot.json'));
  const old = project();
  if (old) rmSync(join(out, old));
  await page.getByTestId('save').click();
  await expect.poll(() => project()).toBeTruthy();
  const file = join(out, project()!);
  await expect.poll(() => { try { JSON.parse(readFileSync(file, 'utf8')); return true; } catch { return false; } }).toBe(true);
  return JSON.parse(readFileSync(file, 'utf8')) as Saved;
}

/** Exports the current page as DXF (Reports tab) and returns the text of the file for sheet `n`. */
async function exportDxf(page: Page, out: string, n: number): Promise<string> {
  await tab(page, 'reports');
  await page.getByTestId('rb-dxfout').click();
  await expect(page.getByRole('region', { name: 'Messages' })).toContainText(`-${String(n).padStart(2, '0')}.dxf`);
  const file = readdirSync(out).find((f) => f.endsWith(`-${String(n).padStart(2, '0')}.dxf`))!;
  return readFileSync(join(out, file), 'utf8');
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

const elements = (s: Saved) => s.pages.flatMap((p) => p.elements);

test('black box and connectors with numbered pins, a ribbon cable between two connectors in the cable list', async () => {
  const { page, out, close } = await launch();
  try {
    const messages = page.getByRole('region', { name: 'Messages' });
    const at = await calibrate(page);
    const click = async (x: number, y: number) => { const p = at(x, y); await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); };

    // A black box from the Insert tab: it starts without pins; Add pin numbers them 1, 2.
    await tab(page, 'insert');
    await page.getByTestId('rb-box').click();
    await click(80, 80);
    await expect(messages).toContainText('Placed -A1 (Black box).');
    const pins = page.getByTestId('box-pins').locator('li');
    await expect(pins).toHaveCount(0);
    await page.getByTestId('add-pin').click();
    await page.getByTestId('add-pin').click();
    await expect(pins).toHaveCount(2);

    // Two connectors, one from the symbol browser and one from the ribbon: four numbered pins each.
    await page.getByTestId('symbol-box-connector').click();
    await click(180, 80);
    await expect(messages).toContainText('Placed -X1 (Connector).');
    await expect(pins).toHaveCount(4);
    await page.getByTestId('rb-connector').click();
    await click(280, 80);
    await expect(messages).toContainText('Placed -X2 (Connector).');

    // A flat ribbon cable from -X1 to -X2 in the Wires and cables dialog.
    await tab(page, 'wires');
    await page.getByTestId('wires').click();
    await page.getByTestId('wires-tab-cables').click();
    await expect(page.getByTestId('cable-id')).toHaveValue('-W1');
    await page.getByTestId('cable-kind').selectOption('ribbon');
    await page.getByTestId('cable-from').selectOption('-X1');
    await page.getByTestId('cable-to').selectOption('-X2');
    await page.getByTestId('add-cable').click();
    const cables = page.getByTestId('cable-table').locator('tbody tr');
    await expect(cables).toHaveCount(1);
    await expect(cables.first()).toContainText('-X1');
    await expect(cables.first()).toContainText('-X2');
    await page.keyboard.press('Escape');

    // The cable list: the cable, then one core per pin, pin n of -X1 to pin n of -X2.
    await tab(page, 'reports');
    await page.getByTestId('reports').click();
    await page.getByTestId('report-cables').click();
    const rows = page.getByTestId('report-table').locator('tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText('-W1');
    for (let i = 1; i <= 4; i++) {
      await expect(rows.nth(i).locator('td').nth(1)).toHaveText(String(i));
      await expect(rows.nth(i)).toContainText(`-X1:${i}`);
      await expect(rows.nth(i)).toContainText(`-X2:${i}`);
    }
    // The connector pin lists show the boxes and their pins.
    await page.getByTestId('report-pins').click();
    await expect(page.getByTestId('report-table')).toContainText('-A1');
    await expect(page.getByTestId('report-table')).toContainText('-X2');
    await page.keyboard.press('Escape');

    // The saved file holds the boxes with their pins and the cable with its ends.
    const s = await save(page, out);
    const boxes = elements(s).filter((e) => e.kind === 'box');
    expect(boxes.map((b) => [b.designation, b.variant, b.pins!.map((p) => p.id)])).toEqual([
      ['-A1', 'blackbox', ['1', '2']],
      ['-X1', 'connector', ['1', '2', '3', '4']],
      ['-X2', 'connector', ['1', '2', '3', '4']],
    ]);
    expect(s.cables).toEqual([expect.objectContaining({ id: '-W1', kind: 'ribbon', from: '-X1', to: '-X2' })]);
  } finally {
    await close();
  }
});

test('macros: save a selection to the company library, place it again with new designations, undo', async () => {
  const { page, out, profile, close } = await launch();
  try {
    const messages = page.getByRole('region', { name: 'Messages' });
    const at = await calibrate(page);
    const click = async (x: number, y: number) => { const p = at(x, y); await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); };

    // A pushbutton and a lamp, wired together.
    await page.getByTestId('symbol-pushbutton-no').click();
    await click(100, 80);
    await page.keyboard.press('Escape');
    await page.getByTestId('symbol-lamp').click();
    await click(140, 80);
    await page.keyboard.press('Escape');
    await expect(messages).toContainText('Placed -H1');
    await page.keyboard.press('w');
    await click(100, 85);
    await click(100, 95);
    await click(140, 95);
    await click(140, 85);
    await page.keyboard.press('Enter');
    await expect(messages).toContainText('Wire drawn.');
    await page.keyboard.press('Escape');
    const symbols = (x: Saved) => elements(x).filter((e) => e.kind === 'symbol');
    let s = await save(page, out);
    const first = symbols(s).map((e) => e.designation!).sort();
    expect(first).toEqual(['-H1', '-S1']);
    expect(symbols(s).map((e) => [e.x, e.y])).toEqual([[100, 80], [140, 80]]);

    // Window selection around the group, then Save as macro in the properties panel. The rectangle leaves a wide
    // margin around the symbols and their labels: a tighter one (85,65 to 160,105) took only 2 of the 3 on the Linux CI runner.
    const a = at(60, 50), b = at(200, 120);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    const props = page.getByRole('complementary', { name: 'Properties' });
    await expect(props).toContainText('3 objects selected');
    await page.getByTestId('macro-name').fill('Pushbutton with lamp');
    await page.getByTestId('macro-name').press('Enter');
    await page.getByTestId('save-macro').click();
    await expect(messages).toContainText('Saved macro Pushbutton with lamp to the company library.');
    const file = join(profile, 'company-library', 'macros', 'company-pushbutton-with-lamp.json');
    expect(existsSync(file)).toBe(true);
    const macro = JSON.parse(readFileSync(file, 'utf8')) as { source: string; elements: El[] };
    expect(macro.source).toBeTruthy();
    expect(macro.elements.map((e) => e.kind).sort()).toEqual(['symbol', 'symbol', 'wire']);

    // The macro is in the symbol browser; placing it adds copies with the next free designations.
    await page.keyboard.press('Escape');
    await page.getByTestId('macro-company-pushbutton-with-lamp').click();
    await click(100, 150);
    await expect(messages).toContainText('Placed macro Pushbutton with lamp.');
    s = await save(page, out);
    // Each device of the macro gets the next free number of its letter code.
    const next = ['-H2', '-S2'];
    expect(symbols(s).map((e) => e.designation).sort()).toEqual(['-H1', '-H2', '-S1', '-S2']);
    expect(elements(s).filter((e) => e.kind === 'wire')).toHaveLength(2);
    const placed = symbols(s).filter((e) => next.includes(e.designation!));
    expect(placed.map((e) => e.symbolId).sort()).toEqual(['lamp', 'pushbutton-no']);
    expect(Math.abs(placed[1].x! - placed[0].x!)).toBeCloseTo(40, 3);
    expect(placed[0].y).toBeGreaterThan(100);

    // Placing the macro is one undo step.
    await page.keyboard.press('Control+z');
    s = await save(page, out);
    expect(symbols(s).map((e) => e.designation).sort()).toEqual(first);
    expect(elements(s).filter((e) => e.kind === 'wire')).toHaveLength(1);
  } finally {
    await close();
  }
});

test('DXF: export a schematic page and import the file again as a page of graphics', async () => {
  const { page, out, close } = await launch();
  try {
    const messages = page.getByRole('region', { name: 'Messages' });
    await page.getByTestId('samples').selectOption('conveyor');
    await expect(page.getByTestId('project-name')).toContainText('Conveyor');
    await page.getByTestId('page-5').click();

    // Export: lines and texts, with the devices of the page.
    const dxf = await exportDxf(page, out, 5);
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('AcDbText');
    expect(dxf).toContain('Motor power circuit');
    expect(dxf).toMatch(/\n-QF1\r?\n/);
    expect(dxf).toContain('Conveyor motor');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);

    // Import: with CP_E2E_DIR the app reads import.dxf from the output folder; the file comes in after page 5.
    copyFileSync(join(out, readdirSync(out).find((f) => f.endsWith('-05.dxf'))!), join(out, 'import.dxf'));
    await tab(page, 'insert');
    await page.getByTestId('rb-dxfin').click();
    await expect(messages).toContainText(/Imported \d+ graphics from the DXF/);
    await expect(page.getByTestId('page-23')).toBeVisible();
    const s = await save(page, out);
    expect(s.pages).toHaveLength(23);
    const imported = s.pages[5];
    expect(imported.type).toBe('layout');
    expect(Object.values(imported.title)).toContain('import');
    const kinds = new Set(imported.elements.map((e) => e.kind));
    expect(kinds.has('line')).toBe(true);
    expect(kinds.has('text')).toBe(true);
    expect(imported.elements.length).toBeGreaterThan(50);
    const texts = imported.elements.filter((e) => e.kind === 'text').map((e) => e.text);
    expect(texts).toContain('Motor power circuit');
    expect(texts).toContain('-QF1');
    expect(texts).toContain('Conveyor motor');
    // One undo step takes the imported page away.
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('page-23')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('reports: add a report as drawing pages, and list and export the nameplates', async () => {
  const { page, out, close } = await launch();
  try {
    const messages = page.getByRole('region', { name: 'Messages' });
    await page.getByTestId('samples').selectOption('conveyor');
    await expect(page.getByTestId('project-name')).toContainText('Conveyor');
    await page.getByTestId('page-1').click();

    // The cable list as pages: added after the current page (the cover sheet).
    await tab(page, 'reports');
    await page.getByTestId('reports').click();
    await page.getByTestId('report-cables').click();
    await expect(page.getByTestId('report-table')).toContainText('-W1');
    await page.getByTestId('report-add-pages').click();
    await expect(messages).toContainText('Added 1 report pages.');
    await expect(page.getByTestId('page-23')).toBeVisible();

    // The nameplates: one label per device with a function text; exported as CSV.
    await page.getByTestId('report-nameplates').click();
    const plates = page.getByTestId('report-table').locator('tbody tr');
    expect(await plates.count()).toBeGreaterThan(3);
    const first = (await plates.first().locator('td').first().textContent())!.trim();
    const text = (await plates.first().locator('td').nth(1).textContent())!.trim();
    expect(first).toMatch(/^[-+=]/);
    expect(text.length).toBeGreaterThan(0);
    await page.getByTestId('report-csv').click();
    await expect(messages).toContainText('Nameplates exported to');
    const csvName = readdirSync(out).find((f) => f.endsWith('-nameplates.csv'))!;
    const csv = readFileSync(join(out, csvName), 'utf8');
    expect(csv).toContain(first);
    expect(csv.split(/\r?\n/).filter(Boolean).length).toBeGreaterThanOrEqual(await plates.count());
    await page.keyboard.press('Escape');

    // The new page shows the cable list: its DXF carries the cable and its cores.
    await page.getByTestId('page-2').click();
    await expect(page.getByTestId('prop-page-title')).toHaveValue('Cable list');
    const dxf = await exportDxf(page, out, 2);
    expect(dxf).toMatch(/\n-W1\r?\n/);
    const s = await save(page, out);
    expect(s.pages).toHaveLength(23);
    expect(s.pages[1].elements).toEqual([expect.objectContaining({ kind: 'report', report: 'cables', offset: 0 })]);
  } finally {
    await close();
  }
});

test('project data: client and drawing number are saved and printed in the title block', async () => {
  const { page, out, close } = await launch();
  try {
    await tab(page, 'reports');
    await page.getByTestId('settings').click();
    await page.getByTestId('tab-data').click();
    for (const [key, value] of [['client', 'Rossi Impianti S.r.l.'], ['drawingNo', 'E-2026-0042'], ['orderNo', 'ORD-7731'], ['drawn', 'J. Smith']]) {
      await page.getByTestId(`field-${key}`).fill(value);
      await page.getByTestId(`field-${key}`).press('Enter');
    }
    await page.keyboard.press('Escape');
    const s = await save(page, out);
    expect(s.properties).toMatchObject({ client: 'Rossi Impianti S.r.l.', drawingNo: 'E-2026-0042', orderNo: 'ORD-7731', drawn: 'J. Smith' });

    // The title block of a schematic page (the starter project opens on page 3) prints the data.
    const dxf = await exportDxf(page, out, 3);
    expect(dxf).toContain('Rossi Impianti S.r.l.');
    expect(dxf).toContain('E-2026-0042');
    expect(dxf).toContain('J. Smith');
    // So does the cover sheet.
    await page.getByTestId('page-1').click();
    const cover = await exportDxf(page, out, 1);
    expect(cover).toContain('Rossi Impianti S.r.l.');
    expect(cover).toContain('E-2026-0042');

    // Each field change is an undo step.
    await page.getByTestId('undo').click();
    const back = await save(page, out);
    expect(back.properties.drawn ?? '').toBe('');
    expect(back.properties.client).toBe('Rossi Impianti S.r.l.');
  } finally {
    await close();
  }
});

test('page types: add a single-line page and a project data form page, fill the form data', async () => {
  const { page, out, close } = await launch();
  try {
    // A single-line page with its own title, after the current page (3 of 3).
    await tab(page, 'insert');
    await page.getByTestId('rb-addpage').click();
    await page.getByTestId('new-page-type').selectOption('singleLine');
    await page.getByTestId('new-page-title').fill('Supply overview');
    await page.getByTestId('confirm-add-page').click();
    await expect(page.getByTestId('page-4')).toBeVisible();
    await expect(page.getByTestId('prop-page-title')).toHaveValue('Supply overview');

    // A project data page with the IEC 61439 form (the default form).
    await page.getByTestId('rb-addpage').click();
    await page.getByTestId('new-page-type').selectOption('data');
    await page.getByTestId('confirm-add-page').click();
    await expect(page.getByTestId('page-5')).toBeVisible();
    await expect(page.getByTestId('prop-page-title')).toHaveValue('General data of the assembly (IEC 61439)');

    // The form takes its values from the assembly data in Project settings.
    await tab(page, 'reports');
    await page.getByTestId('settings').click();
    await page.getByTestId('tab-data').click();
    await page.getByTestId('field-ratedCurrent').fill('630');
    await page.getByTestId('field-ratedCurrent').press('Enter');
    await page.getByTestId('field-ipDegree').fill('IP54');
    await page.getByTestId('field-ipDegree').press('Enter');
    await page.keyboard.press('Escape');

    const s = await save(page, out);
    expect(s.pages).toHaveLength(5);
    expect(s.pages.slice(3).map((p) => p.type)).toEqual(['singleLine', 'data']);
    expect(s.pages[3].title.en).toBe('Supply overview');
    const form = s.pages[4].elements.find((e) => e.kind === 'form');
    expect(form?.items?.length).toBeGreaterThan(5);
    expect(s.assembly).toMatchObject({ ratedCurrent: '630', ipDegree: 'IP54' });

    // The data page prints the values in its form.
    const dxf = await exportDxf(page, out, 5);
    expect(dxf).toMatch(/\n630( A)?\r?\n/);
    expect(dxf).toContain('IP54');
    expect(dxf).toContain('Rated current of the assembly InA');
  } finally {
    await close();
  }
});
