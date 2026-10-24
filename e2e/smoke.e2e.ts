// End-to-end tests of the built app. Run: npm run test:e2e (builds first).
/// <reference lib="dom" />
import { test } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { expect, launch } from './app';

interface SavedProject {
  pages: { type: string; elements: { kind: string; designation?: string }[] }[];
}
const readProject = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as SavedProject;
const count = (p: SavedProject, kind: string) => p.pages.flatMap((pg) => pg.elements).filter((e) => e.kind === kind).length;

test('the built app opens with the main layout and switches language and theme', async () => {
  const { page, close } = await launch();
  try {
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Page navigator' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Symbols and devices' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Properties' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Messages' })).toBeVisible();
    await expect(page.getByTestId('page-canvas')).toBeVisible();

    // contextIsolation on, nodeIntegration off: only the typed API is exposed.
    const isolated = await page.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      api: typeof (window as unknown as { cablepilot?: unknown }).cablepilot,
    }));
    expect(isolated).toEqual({ require: 'undefined', api: 'object' });

    // M0 issue: the status-bar message was cut off ("This window sho…"). It must show in full.
    const status = page.getByTestId('status-message');
    await expect(status).toContainText('Press F1 for all shortcuts.');
    const clipped = await status.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === 'ellipsis');
    expect(clipped).toBe(false);

    await page.getByLabel('Language').selectOption('it');
    await expect(page.getByRole('navigation', { name: 'Navigatore pagine' })).toBeVisible();
    await expect(page.getByTestId('status-message')).toContainText('F1 mostra tutte le scorciatoie');
    await page.getByLabel('Tema').selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  } finally {
    await close();
  }
});

test('place a symbol, draw a wire, undo, save and export a PDF', async () => {
  const { page, out, close } = await launch();
  try {
    const box = (await page.getByTestId('page-canvas').boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const messages = page.getByRole('region', { name: 'Messages' });

    // The starter project opens on its power page. Place a coil.
    await page.getByTestId('symbol-coil').click();
    await page.mouse.move(cx, cy);
    await page.mouse.click(cx, cy);
    await expect(messages).toContainText('Placed -K1 (Coil (relay, contactor)).');
    await page.keyboard.press('Escape');

    // Draw a wire: W, click, click, Enter.
    await page.keyboard.press('w');
    await page.mouse.click(cx - 150, cy - 100);
    await page.mouse.click(cx - 50, cy - 100);
    await page.keyboard.press('Enter');
    await expect(messages).toContainText('Wire drawn.');

    // Save, then check the file: one symbol and one wire.
    await page.getByTestId('save').click();
    await expect(messages).toContainText('Saved');
    const file = readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))!;
    expect(file).toBeTruthy();
    let saved = readProject(join(out, file));
    expect([count(saved, 'symbol'), count(saved, 'wire')]).toEqual([1, 1]);
    expect(saved.pages.flatMap((p) => p.elements).find((e) => e.kind === 'symbol')?.designation).toBe('-K1');

    // Undo (keyboard) removes the wire; saving again overwrites the same file.
    await page.keyboard.press('Control+z');
    await page.getByTestId('save').click();
    await expect.poll(() => count(readProject(join(out, file)), 'wire')).toBe(0);
    saved = readProject(join(out, file));
    expect(count(saved, 'symbol')).toBe(1);
    // Redo brings it back.
    await page.keyboard.press('Control+Shift+z');
    await page.getByTestId('save').click();
    await expect.poll(() => count(readProject(join(out, file)), 'wire')).toBe(1);

    // PDF export: all pages, true-scale vector.
    await page.getByTestId('export-pdf').click();
    await expect(messages).toContainText('PDF exported');
    const pdf = readdirSync(out).find((f) => f.endsWith('.pdf'))!;
    const bytes = readFileSync(join(out, pdf));
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    const size = doc.getPage(0).getSize();
    expect(size.width).toBeCloseTo((420 * 72) / 25.4, 3);
    expect(size.height).toBeCloseTo((297 * 72) / 25.4, 3);
  } finally {
    await close();
  }
});

test('the sample projects open', async () => {
  const { page, close } = await launch();
  try {
    for (const [id, name, pages] of [['conveyor', 'Conveyor with direct-on-line starter', 10], ['pump-station', 'Pump station, two pumps', 10], ['dc-charger', 'Caricabatterie 110 V DC', 12]] as const) {
      await page.getByTestId('samples').selectOption(id);
      await expect(page.getByTestId('project-name')).toContainText(name);
      await expect(page.getByRole('region', { name: 'Messages' })).toContainText(`Opened ${name}.`);
      await expect(page.getByTestId(`page-${pages}`)).toBeVisible();
      await expect(page.getByTestId(`page-${pages + 1}`)).toHaveCount(0);
    }
    // Page two of a sample is the generated contents page; selecting pages works.
    await page.getByTestId('page-5').click();
    await expect(page.getByRole('complementary', { name: 'Properties' })).toContainText('Sheet size');
  } finally {
    await close();
  }
});

test('project settings: drawing language and zone labels are saved in the project', async () => {
  const { page, out, close } = await launch();
  try {
    await page.getByTestId('settings').click();
    await page.getByTestId('drawing-language').selectOption('it');
    await page.getByTestId('tab-frame').click();
    const cols = page.getByLabel('Column labels (left to right)');
    await cols.fill('A B C D E F G H M N P R S T U');
    await cols.blur();
    await page.keyboard.press('Escape');
    await page.getByTestId('save').click();
    const file = await expect.poll(() => readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))).toBeTruthy().then(() => readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))!);
    const saved = JSON.parse(readFileSync(join(out, file), 'utf8')) as { settings: { drawingLanguage: string }; templates: { frame: { columns: string[] } }[] };
    expect(saved.settings.drawingLanguage).toBe('it');
    expect(saved.templates[0].frame.columns).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'M', 'N', 'P', 'R', 'S', 'T', 'U']);
  } finally {
    await close();
  }
});

test('the symbol editor saves a company symbol that appears in the library', async () => {
  const { page, profile, close } = await launch();
  try {
    await page.getByRole('button', { name: 'Symbol editor...' }).click();
    const svg = page.getByTestId('symed-canvas');
    const b = (await svg.boundingBox())!;
    const at = (mmX: number, mmY: number) => ({ x: b.x + (mmX + 20) * 11, y: b.y + (mmY + 20) * 11 });
    await page.getByTestId('ed-rect').click();
    for (const p of [at(-5, -5), at(5, 5)]) await page.mouse.click(p.x, p.y);
    await page.getByTestId('ed-pin').click();
    await page.mouse.click(at(0, -10).x, at(0, -10).y);
    await page.getByTestId('symed-id').fill('company-test-box');
    await page.getByTestId('symed-en').fill('Company test box');
    await page.getByTestId('symed-save').click();
    await expect(page.getByTestId('symbol-company-test-box')).toBeVisible();
    expect(existsSync(join(profile, 'company-library', 'symbols', 'company-test-box.json'))).toBe(true);
    // The same validation as the library check: the file has its source and verification.
    const def = JSON.parse(readFileSync(join(profile, 'company-library', 'symbols', 'company-test-box.json'), 'utf8')) as { source: string; pins: unknown[] };
    expect(def.source).toBeTruthy();
    expect(def.pins).toHaveLength(1);
  } finally {
    await close();
  }
});

test('crash recovery: an unsaved project comes back after the app closes without saving', async () => {
  const first = await launch();
  const { profile } = first;
  try {
    const box = (await first.page.getByTestId('page-canvas').boundingBox())!;
    await first.page.getByTestId('symbol-lamp').click();
    await first.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(first.page.getByRole('region', { name: 'Messages' })).toContainText('Placed -H1');
    // Autosave writes a few seconds after the last change.
    await expect.poll(() => existsSync(join(profile, 'autosave')) && readdirSync(join(profile, 'autosave')).length, { timeout: 20_000 }).toBeGreaterThan(0);
  } finally {
    await first.close();
  }
  const second = await launch({ profile });
  try {
    await expect(second.page.getByTestId('recovery')).toBeVisible();
    await second.page.getByTestId('recover').click();
    await expect(second.page.getByRole('region', { name: 'Messages' })).toContainText('Recovered an autosaved copy');
    await second.page.getByTestId('save').click();
    const file = readdirSync(second.out).find((f) => f.endsWith('.cablepilot.json'))!;
    expect(count(readProject(join(second.out, file)), 'symbol')).toBe(1);
  } finally {
    await second.close();
  }
});

test('a device with a coil and a contact shows its cross-references, takes a part, and appears in the BOM', async () => {
  const { page, out, close } = await launch();
  try {
    const box = (await page.getByTestId('page-canvas').boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    // Coil -K1, then a contact that takes the coil's designation: one device, two representations.
    await page.getByTestId('symbol-coil').click();
    await page.mouse.click(cx - 100, cy);
    await page.keyboard.press('Escape');
    await page.getByTestId('symbol-contact-no').click();
    await page.mouse.click(cx + 100, cy - 60);
    await page.keyboard.press('Escape');
    await page.mouse.click(cx + 100, cy - 60);
    await page.getByTestId('prop-designation').fill('-K1');
    await page.getByTestId('prop-designation').blur();
    const reps = page.getByTestId('device-reps');
    await expect(reps).toContainText('Coil');
    await expect(reps).toContainText('Auxiliary contact (NO)');
    // Cross-reference text in the default format page.column (the starter project's power page is page 3).
    await expect(reps).toContainText(/Coil: 3\.[0-9]/);
    await expect(reps).toContainText(/Auxiliary contact \(NO\): 3\.[0-9]/);
    // Assign a generic part from the library.
    await page.getByTestId('part-select').selectOption('generic-contactor-9a');
    await page.getByTestId('part-add').click();
    await expect(page.getByTestId('device-parts')).toContainText('GEN-CONTACTOR-9A');
    // The BOM lists the device once, with the part code and the quantity.
    await page.getByTestId('bom').click();
    const table = page.getByTestId('bom-table');
    await expect(table).toContainText('-K1');
    await expect(table).toContainText('GEN-CONTACTOR-9A');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await page.getByTestId('bom-units').fill('3');
    await page.getByTestId('bom-units').blur();
    await expect(table.locator('tbody tr td').nth(2)).toHaveText('3');
    await page.getByTestId('bom-export').click();
    await expect(page.getByRole('region', { name: 'Messages' })).toContainText('BOM exported');
    const csv = readdirSync(out).find((f) => f.endsWith('-bom.csv'))!;
    expect(readFileSync(join(out, csv), 'utf8')).toContain('GEN-CONTACTOR-9A');
  } finally {
    await close();
  }
});
