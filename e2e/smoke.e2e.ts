// End-to-end tests of the built app. Run: npm run test:e2e (builds first).
/// <reference lib="dom" />
import { test } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { expect, launch, tab } from './app';

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
    for (const [id, name, pages] of [['conveyor', 'Conveyor with direct-on-line starter', 22], ['pump-station', 'Pump station, two pumps', 22], ['dc-charger', 'Caricabatterie 110 V DC', 27]] as const) {
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
    await tab(page, 'reports');
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
    // The coil offers its contacts; the offer goes away by itself once a contact joins the device.
    await expect(page.getByTestId('ai-hint')).toContainText('Add the contacts of -K1?');
    await page.getByTestId('symbol-contact-no').click();
    await page.mouse.click(cx + 100, cy - 60);
    await page.keyboard.press('Escape');
    await page.mouse.click(cx + 100, cy - 60);
    await page.getByTestId('prop-designation').fill('-K1');
    await page.getByTestId('prop-designation').blur();
    const reps = page.getByTestId('device-reps');
    await expect(reps).toContainText('Coil');
    await expect(reps).toContainText('Auxiliary contact (NO)');
    await expect(page.getByTestId('ai-hint')).toHaveCount(0);
    // Cross-reference text in the default format page.column (the starter project's power page is page 3).
    await expect(reps).toContainText(/Coil: 3\.[0-9]/);
    await expect(reps).toContainText(/Auxiliary contact \(NO\): 3\.[0-9]/);
    // Assign a generic part from the library.
    await page.getByTestId('part-select').selectOption('generic-contactor-9a');
    await page.getByTestId('part-add').click();
    await expect(page.getByTestId('device-parts')).toContainText('GEN-CONTACTOR-9A');
    // The BOM lists the device once, with the part code and the quantity.
    await tab(page, 'reports');
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

test('M3: number the wires, view the terminal diagram, export the PDF set and the XLSX lists', async () => {
  const { page, out, close } = await launch();
  try {
    const messages = page.getByRole('region', { name: 'Messages' });
    await page.getByTestId('samples').selectOption('dc-charger');
    await expect(page.getByTestId('project-name')).toContainText('Caricabatterie');

    // Number the wires: switch to the sequential scheme, number now, and see plain counters in the saved file.
    await tab(page, 'wires');
    await page.getByTestId('wires').click();
    await page.getByTestId('num-scheme').selectOption('sequential');
    await page.getByTestId('wires-number-now').click();
    await expect(messages).toContainText('Wires numbered.');
    await page.keyboard.press('Escape');
    await page.getByTestId('save').click();
    const saved = await expect.poll(() => readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))).toBeTruthy().then(() => readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))!);
    const proj = JSON.parse(readFileSync(join(out, saved), 'utf8')) as { pages: { type: string; elements: { kind: string; number?: string; bundle?: boolean }[] }[] };
    // A bundle of wires carries its label ("10 mm² BK"), not a number.
    const numbers = proj.pages.filter((p) => p.type === 'power' || p.type === 'control' || p.type === 'plc').flatMap((p) => p.elements).filter((e) => e.kind === 'wire' && !e.bundle).map((e) => e.number);
    expect(numbers.length).toBeGreaterThan(30);
    expect(numbers.every((n) => /^\d+$/.test(n ?? ''))).toBe(true);
    // Renumbering is one undo step: undo restores the suffixed numbers of the sample.
    await page.getByTestId('undo').click();
    await page.getByTestId('save').click();
    const again = JSON.parse(readFileSync(join(out, saved), 'utf8')) as typeof proj;
    expect(again.pages.flatMap((p) => p.elements).some((e) => e.kind === 'wire' && /L\+$/.test(e.number ?? ''))).toBe(true);

    // The terminal diagram: destination, wire, terminal, function text and part of strip -X1 (Italian, the drawing language).
    await tab(page, 'reports');
    await page.getByTestId('reports').click();
    await page.getByTestId('report-terminals').click();
    const table = page.getByTestId('report-table');
    await expect(table).toContainText('-X1');
    await expect(table).toContainText('Uscita carico L+');
    await expect(table).toContainText('GEN-TERMINAL-FEEDTHROUGH-6MM2');
    await expect(table).toContainText('-G1:+');

    // XLSX with every list, then the PDF set.
    await page.getByTestId('export-xlsx').click();
    await expect(messages).toContainText('Lists exported');
    const xlsx = readdirSync(out).find((f) => f.endsWith('.xlsx'))!;
    const bytes = readFileSync(join(out, xlsx));
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.toString('latin1')).toContain('Elenco fili');
    await page.keyboard.press('Escape');
    await page.getByTestId('export-pdf').click();
    await expect(messages).toContainText('PDF exported');
    const pdf = readdirSync(out).find((f) => f.endsWith('.pdf'))!;
    const pdfBytes = readFileSync(join(out, pdf));
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(27);
    // The text is embedded (a font file in the PDF), so it shows in every viewer.
    expect(doc.context.enumerateIndirectObjects().some(([, o]) => o instanceof PDFDict && o.has(PDFName.of('FontFile2')))).toBe(true);
  } finally {
    await close();
  }
});

test('M4: the warnings banner finds a loose wire, fixes it with one click, and undo brings it back', async () => {
  const { page, close } = await launch();
  try {
    const box = (await page.getByTestId('page-canvas').boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await expect(page.getByTestId('checks-banner')).toHaveCount(0);
    await expect(page.getByTestId('no-findings')).toBeVisible();
    await page.keyboard.press('w');
    await page.mouse.click(cx - 150, cy - 100);
    await page.mouse.click(cx - 50, cy - 100);
    await page.keyboard.press('Enter');
    const banner = page.getByTestId('checks-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByTestId('checks-summary')).toContainText('0 errors, 1 warning,');
    const finding = page.getByTestId('finding');
    await expect(finding).toHaveCount(1);
    await expect(finding).toContainText('not connected at either end');
    await expect(finding).toContainText('IEC 61082-1');
    await page.getByTestId('fix-one').click();
    await expect(banner).toHaveCount(0);
    await expect(page.getByTestId('no-findings')).toBeVisible();
    await page.getByTestId('undo').click();
    await expect(banner).toBeVisible();
    // Fix all of them in one step, in Italian.
    await page.getByLabel('Language').selectOption('it');
    await expect(page.getByTestId('checks-summary')).toContainText('0 errori, 1 avviso,');
    await page.getByTestId('fix-all').click();
    await expect(banner).toHaveCount(0);
  } finally {
    await close();
  }
});

test('M4: issue a revision, see the changed page, compare, and read the cover sheet', async () => {
  const { page, out, close } = await launch();
  try {
    await page.getByTestId('samples').selectOption('conveyor');
    await expect(page.getByTestId('project-name')).toContainText('Conveyor');
    // The sample ships with revision 0 issued and nothing changed since.
    await expect(page.getByTestId('checks-banner')).toHaveCount(0);
    await expect(page.getByTestId('page-changed')).toHaveCount(0);
    // Change one page: it is marked in the navigator and listed in the Revisions window.
    await page.getByTestId('page-5').click();
    const box = (await page.getByTestId('page-canvas').boundingBox())!;
    await page.getByTestId('symbol-lamp').click();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press('Escape');
    // The power page and the lists that print from it (BOM, nameplates...) changed.
    await expect(page.getByTestId('page-changed').first()).toBeVisible();
    expect(await page.getByTestId('page-changed').count()).toBeGreaterThanOrEqual(2);
    await tab(page, 'reports');
    await page.getByTestId('revisions').click();
    await expect(page.getByTestId('changed-pages')).toContainText('changed');
    await page.getByTestId('issue-status').selectOption('construction');
    await page.getByTestId('rev-description').fill('Lamp added');
    await page.getByTestId('rev-description').blur();
    await page.getByTestId('issue-revision').click();
    await expect(page.getByRole('region', { name: 'Messages' })).toContainText('Revision 1 issued');
    await expect(page.getByTestId('page-changed')).toHaveCount(0);
    // The window lists both revisions and compares them: the changed page is highlighted.
    await tab(page, 'reports');
    await page.getByTestId('revisions').click();
    await expect(page.getByTestId('revision-table').locator('tbody tr')).toHaveCount(2);
    await page.getByTestId('cmp-from').selectOption('0');
    await page.getByTestId('cmp-to').selectOption('1');
    await expect(page.getByTestId('cmp-pages').locator('li.rev-changed').first()).toBeVisible();
    await expect(page.getByTestId('cmp-devices')).toContainText('-H');
    await page.keyboard.press('Escape');
    // The cover sheet (page 1) is a canvas; the saved file holds the revisions and the status.
    await page.getByTestId('save').click();
    const file = readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))!;
    const saved = JSON.parse(readFileSync(join(out, file), 'utf8')) as { issueStatus: string; version: number; revisions: { number: string; description: string; pages: unknown[] }[] };
    expect(saved.version).toBe(7);
    expect(saved.issueStatus).toBe('construction');
    expect(saved.revisions.map((r) => r.number)).toEqual(['0', '1']);
    expect(saved.revisions[1].description).toBe('Lamp added');
  } finally {
    await close();
  }
});

test('M5: assign an address in the PLC overview, export a tag list, import tags with a preview', async () => {
  const { page, out, close } = await launch();
  try {
    await page.getByTestId('samples').selectOption('conveyor');
    await expect(page.getByTestId('checks-banner')).toHaveCount(0);
    await tab(page, 'plc');
    await page.getByTestId('plc').click();
    const table = page.getByTestId('plc-table');
    await expect(table.locator('tbody tr')).toHaveCount(16);
    await expect(page.getByTestId('plc-address-0')).toHaveValue('I0.0');
    await expect(page.getByTestId('plc-tag-0')).toHaveValue('S0_EStop_OK');
    // Give the first input another address: the overview keeps it and the file gets it.
    await page.getByTestId('plc-address-0').fill('I1.0');
    await page.getByTestId('plc-address-0').blur();
    await expect(page.getByTestId('plc-address-0')).toHaveValue('I1.0');
    // The TIA format is marked unverified; CODESYS is not.
    await expect(page.getByTestId('tags-unverified-tia')).toBeVisible();
    await expect(page.getByTestId('tags-unverified-codesys')).toHaveCount(0);
    await page.getByTestId('tags-export-codesys').click();
    await expect(page.getByRole('region', { name: 'Messages' })).toContainText('Tag list exported');
    const gvl = readdirSync(out).find((f) => f.endsWith('-tags-codesys.txt'))!;
    expect(readFileSync(join(out, gvl), 'utf8')).toContain('S0_EStop_OK AT %IX1.0 : BOOL;');
    await page.getByTestId('tags-export-tia').click();
    const xml = readdirSync(out).find((f) => f.endsWith('-tags-tia.xml'))!;
    expect(readFileSync(join(out, xml), 'utf8')).toContain('<LogicalAddress>%I1.0</LogicalAddress>');
    // Import: previewed first, applied as one change.
    writeFileSync(join(out, 'tags-import.txt'), 'VAR_GLOBAL\n  Start_PB AT %IX0.1 : BOOL; (* Start pushbutton NO *)\n  Nowhere AT %IX9.9 : BOOL;\nEND_VAR\n');
    await page.getByTestId('tags-import-codesys').click();
    const preview = page.getByTestId('tags-preview');
    await expect(preview).toContainText('will be set');
    await expect(preview).toContainText('not an address');
    await page.getByTestId('tags-apply').click();
    await expect(preview).toHaveCount(0);
    await expect(page.getByTestId('plc-tag-1')).toHaveValue('Start_PB');
    // The address change from above is still there; both edits are undoable steps.
    await page.keyboard.press('Escape');
    await page.getByTestId('undo').click();
    await tab(page, 'plc');
    await page.getByTestId('plc').click();
    await expect(page.getByTestId('plc-tag-1')).toHaveValue('S1_Start');
    await expect(page.getByTestId('plc-address-0')).toHaveValue('I1.0');
  } finally {
    await close();
  }
});

test('M6: import stock, size a motor feeder, confirm, and see the BOM quantities', async () => {
  const { page, out, close } = await launch();
  try {
    await page.getByTestId('samples').selectOption('conveyor');
    await expect(page.getByTestId('checks-banner')).toHaveCount(0);
    const messages = page.getByRole('region', { name: 'Messages' });

    // The company's stock file: Italian ERP headers and semicolons; the wizard guesses the mapping, which is saved.
    writeFileSync(join(out, 'stock-import.csv'), [
      'Codice articolo;Descrizione;Giacenza;Impegnato;Ubicazione;Magazzino;UM',
      'GEN-CONTACTOR-12A;Contattore 12 A;25;5;A-03-02;Centrale;pz',
      'GEN-CONTACTOR-18A;Contattore 18 A;18;4;A-03-03;Centrale;pz',
      'GEN-OVERLOAD-RELAY-9A-13A;Relè 9-13 A;14;2;A-04-02;Centrale;pz',
      'GEN-OVERLOAD-RELAY-12A-18A;Relè 12-18 A;6;2;A-04-03;Centrale;pz',
      'GEN-MCB-3P-C16A;MCB C16;60;10;A-01-02;Centrale;pz',
      'LABEL-ROLL-WHITE;Rotolo etichette;12;0;E-01-01;Centrale;pz',
    ].join('\n'));
    await tab(page, 'reports');
    await page.getByTestId('warehouse').click();
    await page.getByTestId('wh-pick-file').click();
    await expect(page.getByTestId('wh-wizard')).toBeVisible();
    await expect(page.getByTestId('wh-map-code')).toHaveValue('Codice articolo');
    await expect(page.getByTestId('wh-map-onHand')).toHaveValue('Giacenza');
    await page.getByTestId('wh-import').click();
    await expect(page.getByTestId('wh-table').locator('tbody tr')).toHaveCount(6);
    await expect(messages).toContainText('6 items imported');
    await expect(page.getByTestId('wh-data-missing')).toHaveCount(1); // the label roll has no technical data
    await page.keyboard.press('Escape');

    // The motor of the conveyor: raise it to 7.5 kW on its nameplate, then size its feeder.
    await page.getByTestId('page-5').click();
    await page.keyboard.press('f');
    const canvas = page.getByTestId('page-canvas');
    const b = (await canvas.boundingBox())!;
    const zoom = Number(/Zoom\s+(\d+)\s*%/.exec(await page.locator('body').innerText())![1]) / 100;
    await page.mouse.click(b.x + b.width / 2 + (210 - 210) * zoom, b.y + b.height / 2 + (234 - 148.5) * zoom);
    await expect(page.getByTestId('device-section')).toContainText('+DS-M1');
    await expect(page.getByTestId('load-ib')).toContainText('10.74');
    await page.getByTestId('load-power').fill('7.5');
    await page.getByTestId('load-power').blur();
    await expect(page.getByTestId('load-ib')).toContainText('14.64');
    await page.getByTestId('device-sizing').click();
    const lines = page.getByTestId('sizing-line');
    await expect(lines).toHaveCount(5);
    const km = page.locator('[data-testid="sizing-line"][data-role="contactor"]');
    await expect(km).toHaveAttribute('data-status', 'change');
    await expect(km).toContainText('GEN-CONTACTOR-18A');
    await expect(km).toContainText('Centrale A-03-03');
    await expect(page.locator('[data-testid="sizing-line"][data-role="breaker"]')).toHaveAttribute('data-status', 'ok');

    // Suggestion panel: the requirement, its assumptions, the unverified values and the ranked parts with their stock.
    await km.getByTestId('sizing-choose').click();
    const panel = page.getByTestId('sizing-panel');
    await expect(panel).toContainText('AC-3 ≥ 14.6 A');
    await expect(panel).toContainText('does not replace the engineer');
    await expect(panel.getByTestId('sizing-options').locator('tbody tr').first()).toContainText('GEN-CONTACTOR-18A');
    await expect(panel.getByTestId('stock-available').first()).toContainText('available for this project 14 pz');
    await panel.getByTestId('sizing-confirm').click();
    await expect(km).toHaveAttribute('data-status', 'ok');

    // The BOM follows, with the stock columns: 18 on hand, 4 reserved, the project uses 1.
    await page.keyboard.press('Escape');
    await tab(page, 'reports');
    await page.getByTestId('bom').click();
    const bom = page.getByTestId('bom-table');
    const row = bom.locator('tbody tr', { hasText: 'GEN-CONTACTOR-18A' });
    await expect(row).toContainText('A-03-03');
    await expect(bom.locator('thead')).toContainText('Available');
    await expect(row.locator('td').nth(-3)).toHaveText('13'); // available: 18 - 4 - 1
    await expect(bom).not.toContainText('GEN-CONTACTOR-12A');
    // Units to build multiply the use: 20 units need 20 of the 14 free contactors.
    await page.getByTestId('bom-units').fill('20');
    await page.getByTestId('bom-units').blur();
    await expect(page.getByTestId('bom-short')).toBeVisible();
    await expect(row.locator('td').nth(-2)).toHaveText('6'); // short: 20 - 14
    await page.getByTestId('bom-pick-csv').click();
    const pick = readdirSync(out).find((f) => f.endsWith('-picking-list.csv'))!;
    const csv = readFileSync(join(out, pick), 'utf8');
    expect(csv).toContain('GEN-CONTACTOR-18A');
    expect(csv).toContain('Short');
    await page.keyboard.press('Escape');
    await expect(messages).toContainText('Short in the warehouse: GEN-CONTACTOR-18A, 6 pz missing');

    // Undo takes the contactor back in one step; "size the whole project" accepts everything in one step.
    await page.getByTestId('bom-units').count();
    await tab(page, 'reports');
    await page.getByTestId('sizing').click();
    await expect(page.getByTestId('sizing-feeder')).toHaveCount(1);
    await expect(km).toHaveAttribute('data-status', 'ok');
    await page.keyboard.press('Escape');
    await page.getByTestId('undo').click(); // units back to 1
    await page.getByTestId('undo').click(); // the contactor assignment
    await tab(page, 'reports');
    await page.getByTestId('sizing').click();
    await expect(km).toHaveAttribute('data-status', 'change');
    await expect(page.getByTestId('sizing-accept-all')).toContainText('(2)');
    await page.getByTestId('sizing-accept-all').click();
    await expect(page.locator('[data-testid="sizing-line"][data-status="change"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTestId('undo').click();
    await tab(page, 'reports');
    await page.getByTestId('sizing').click();
    await expect(page.locator('[data-testid="sizing-line"][data-status="change"]')).toHaveCount(2);
    await page.keyboard.press('Escape');

    // An old stock list is flagged in the message list.
    await tab(page, 'reports');
    await page.getByTestId('warehouse').click();
    await page.getByTestId('wh-date').fill('2026-01-01');
    await expect(page.getByTestId('wh-stale')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('stock-stale')).toBeVisible();
  } finally {
    await close();
  }
});
