// Records the website's short clips (one per feature area, in English and Italian) from the real built app, like
// BoardPilot's "Short videos": Playwright's recordVideo at 1920 x 1080, the app's UI in the clip's language, a visible
// pointer and the captions drawn on top (e2e/recorder.ts), so they are part of the video. Nothing is faked: every
// pixel is the app, driving the sample projects. Clips and captions: e2e/clips.json.
// Skipped in CI and unless asked for: npm run record:clips (builds, records, encodes with scripts/clips-video.mjs,
// rebuilds the site). Output: out/clips/<clip>-<lang>.webm and .json (when the clip starts and ends).
/// <reference lib="dom" />
import { test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, launch, tab } from './app';
import { recorder } from './recorder';

test.skip(!!process.env.CI || !process.env.CP_CLIPS, 'run with npm run record:clips (not in CI)');

type Lang = 'en' | 'it';
type L = Record<Lang, string>;
interface Clip { id: string; title: L; desc: L; captions: ({ id: string } & L)[]; note?: L }
const { clips } = JSON.parse(readFileSync(join(__dirname, 'clips.json'), 'utf8')) as { clips: Clip[] };
const W = 1920;
const H = 1080;
const outDir = join(__dirname, '..', 'out', 'clips');
const only = (process.env.CP_CLIPS ?? '').split(',').filter((x) => x && x !== '1');
const langs: Lang[] = process.env.CP_CLIPS_LANG === 'it' ? ['it'] : process.env.CP_CLIPS_LANG === 'en' ? ['en'] : ['en', 'it'];

interface Ctx {
  page: Page;
  lang: Lang;
  out: string;
  r: ReturnType<typeof recorder>;
  /** Shows a caption of this clip by id. */
  cap(id: string, top?: boolean): Promise<void>;
  open(sample: 'dc-charger' | 'conveyor' | 'pump-station'): Promise<void>;
}

const L = (lang: Lang, en: string, it: string) => (lang === 'it' ? it : en);

const SCRIPTS: Record<string, (c: Ctx) => Promise<void>> = {
  // ---- schematic: a coil and its contact as one device, a part for the BOM ----
  schematic: async ({ page, lang, r, cap, open }) => {
    await open('dc-charger');
    await r.gotoPage(8, 600);
    await r.fit();
    await cap('pick');
    await r.typeInto(page.getByTestId('symbol-search'), L(lang, 'coil', 'bobina'), false);
    await r.wait(300);
    await r.clickOn(page.getByTestId('symbol-coil'), 600);
    const coilAt = await r.mm(250, 100);
    await r.clickAt(coilAt.x, coilAt.y, 700);
    await page.keyboard.press('Escape');
    await cap('coil');
    await r.zoomAt(coilAt.x, coilAt.y, 7);
    await r.wait(1600);
    await r.fit();
    const c2 = await r.mm(250, 100);
    await r.clickAt(c2.x, c2.y, 500);
    const dsg = await page.getByTestId('prop-designation').inputValue();
    await page.keyboard.press('Escape');
    await cap('contact');
    await r.typeInto(page.getByTestId('symbol-search'), L(lang, 'contact', 'contatto'), false);
    await r.wait(300);
    await r.clickOn(page.getByTestId('symbol-contact-no'), 600);
    const contactAt = await r.mm(250, 178);
    await r.clickAt(contactAt.x, contactAt.y, 700);
    await page.keyboard.press('Escape');
    await r.wait(250);
    await r.clickAt(contactAt.x, contactAt.y, 350);
    await r.typeInto(page.getByTestId('prop-designation'), dsg, true);
    await expect(page.getByTestId('device-reps').locator('li')).toHaveCount(2);
    await r.wait(500);
    await r.zoomAt(contactAt.x, (coilAt.y + contactAt.y) / 2, 5);
    await r.wait(1800);
    await r.fit();
    const again = await r.mm(250, 178);
    await r.clickAt(again.x, again.y, 500);
    await cap('part');
    await r.clickOn(page.getByTestId('part-select'), 600);
    await page.getByTestId('part-select').selectOption('generic-contactor-9a');
    await r.wait(300);
    await r.clickOn(page.getByTestId('part-add'), 450);
    await expect(page.getByTestId('device-parts')).toContainText('GEN-CONTACTOR-9A');
    await r.hover(page.getByTestId('device-parts'), 600);
    await r.wait(1800);
  },

  // ---- wire numbers and the live lists ----
  reports: async ({ page, r, cap, open }) => {
    await open('dc-charger');
    await r.gotoPage(6, 600);
    await r.fit();
    await cap('number');
    await tab(page, 'wires');
    await r.clickOn(page.getByTestId('wires'), 700);
    await r.wait(800);
    await r.clickOn(page.getByTestId('wires-number-now'), 600);
    await r.wait(700);
    await page.keyboard.press('Escape');
    const z = await r.mm(150, 110);
    await r.zoomAt(z.x, z.y, 6);
    await r.wait(1800);
    await r.fit();
    await cap('wires');
    await tab(page, 'reports');
    await r.clickOn(page.getByTestId('reports'), 700);
    await r.clickOn(page.getByTestId('report-wires'), 500);
    await expect(page.getByTestId('report-table')).toBeVisible();
    await r.wait(2200);
    await cap('terminals', true);
    await r.clickOn(page.getByTestId('report-terminals'), 500);
    await r.wait(1700);
    await r.clickOn(page.getByTestId('report-cables'), 500);
    await r.wait(1700);
    await cap('bom', true);
    await r.clickOn(page.getByTestId('report-bom'), 500);
    await r.wait(2400);
    await page.keyboard.press('Escape');
    await r.gotoPage(10, 1800);
  },

  // ---- the rule check, a one-click fix, a revision ----
  checks: async ({ page, lang, r, cap, open }) => {
    await open('dc-charger');
    await r.gotoPage(8, 600);
    await r.fit();
    await cap('loose');
    await tab(page, 'wires');
    await r.clickOn(page.getByTestId('tool-wire'), 600);
    const w1 = await r.mm(40, 238), w2 = await r.mm(105, 238);
    await r.clickAt(w1.x, w1.y, 700);
    await r.clickAt(w2.x, w2.y, 500);
    await page.keyboard.press('Enter');
    await cap('banner');
    await expect(page.getByTestId('checks-banner')).toBeVisible();
    await r.hover(page.getByTestId('checks-summary'), 700);
    await r.wait(2000);
    await cap('fix');
    await r.clickOn(page.getByTestId('fix-one'), 800);
    await expect(page.getByTestId('checks-banner')).toHaveCount(0);
    await r.wait(1500);
    await cap('revision', true);
    await r.typeInto(page.getByTestId('symbol-search'), L(lang, 'lamp', 'lampada'), false);
    await r.clickOn(page.getByTestId('symbol-lamp'), 500);
    const lamp = await r.mm(320, 120);
    await r.clickAt(lamp.x, lamp.y, 600);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('page-changed').first()).toBeVisible();
    await r.hover(page.getByTestId('page-changed').first(), 700);
    await r.wait(900);
    await tab(page, 'reports');
    await r.clickOn(page.getByTestId('revisions'), 700);
    await expect(page.getByTestId('changed-pages')).toBeVisible();
    await r.wait(900);
    await r.typeInto(page.getByTestId('rev-description'), L(lang, 'Indicator lamp added', 'Aggiunta lampada di segnalazione'), true, 45);
    await r.clickOn(page.getByTestId('issue-revision'), 600);
    await r.wait(700);
    await page.keyboard.press('Escape');
    await r.gotoPage(1, 500);
    await r.fit();
    const matrix = await r.mm(205, 118);
    await r.zoomAt(matrix.x, matrix.y, 7);
    await r.wait(2200);
  },

  // ---- PLC overview and tag lists ----
  plc: async ({ page, r, cap, open }) => {
    await open('conveyor');
    await r.gotoPage(7, 600);
    await r.fit();
    await r.wait(500);
    await cap('overview', true);
    await tab(page, 'plc');
    await r.clickOn(page.getByTestId('plc'), 700);
    await expect(page.getByTestId('plc-table')).toBeVisible();
    const rows = page.getByTestId('plc-table').locator('tbody tr');
    for (const i of [0, 2, 4]) {
      if ((await rows.count()) > i) await r.hover(rows.nth(i), 500);
      await r.wait(500);
    }
    await r.wait(800);
    await cap('tag', true);
    await r.typeInto(page.getByTestId('plc-tag-1'), 'Start_Pushbutton', true, 70);
    await r.wait(1400);
    await cap('export', true);
    await r.clickOn(page.getByTestId('tags-export-codesys'), 700);
    await r.wait(1200);
    await r.clickOn(page.getByTestId('tags-export-tia'), 700);
    await r.wait(1600);
    await page.keyboard.press('Escape');
    await r.wait(1200);
  },

  // ---- the drawing set ----
  'drawing-set': async ({ page, r, cap, open }) => {
    await open('dc-charger');
    await r.gotoPage(1, 400);
    await r.fit();
    await cap('cover');
    const matrix = await r.mm(205, 118);
    await r.zoomAt(matrix.x, matrix.y, 6);
    await r.wait(2200);
    await r.fit();
    await cap('data');
    await r.gotoPage(3, 400);
    await r.fit();
    const d = await r.mm(130, 100);
    await r.zoomAt(d.x, d.y, 4);
    await r.wait(1800);
    await r.fit();
    await cap('single');
    await r.gotoPage(5, 1900);
    await r.gotoPage(6, 1900);
    await cap('lists');
    await r.gotoPage(10, 1700);
    await r.gotoPage(19, 1700);
    await cap('pdf');
    await r.clickOn(page.getByTestId('export-pdf'), 700);
    await r.wait(2600);
  },

  // ---- sizing from the warehouse ----
  sizing: async ({ page, r, cap, open }) => {
    await open('conveyor');
    await cap('stock', true);
    await tab(page, 'reports');
    await r.clickOn(page.getByTestId('warehouse'), 700);
    await r.clickOn(page.getByTestId('wh-sample'), 600);
    await expect(page.getByTestId('wh-table')).toBeVisible();
    await r.wait(1600);
    await page.keyboard.press('Escape');
    await r.gotoPage(5, 400);
    await r.fit();
    await cap('motor');
    const motor = await r.mm(210, 234);
    await r.clickAt(motor.x, motor.y, 700);
    await expect(page.getByTestId('device-section')).toContainText('+DS-M1');
    await r.typeInto(page.getByTestId('load-power'), '7.5', true);
    await expect(page.getByTestId('load-ib')).toContainText('14.64');
    await r.wait(1200);
    await cap('size', true);
    await r.clickOn(page.getByTestId('device-sizing'), 600);
    const km = page.locator('[data-testid="sizing-line"][data-role="contactor"]');
    await expect(km).toHaveAttribute('data-status', 'change');
    await r.wait(1800);
    await cap('pick', true);
    await r.clickOn(km.getByTestId('sizing-choose'), 600);
    await expect(page.getByTestId('sizing-panel')).toBeVisible();
    await r.wait(1600);
    await r.clickOn(page.getByTestId('sizing-confirm'), 600);
    await expect(km).toHaveAttribute('data-status', 'ok');
    await r.wait(900);
    await page.keyboard.press('Escape');
    await cap('bom', true);
    await tab(page, 'reports');
    await r.clickOn(page.getByTestId('bom'), 700);
    const row = page.getByTestId('bom-table').locator('tbody tr', { hasText: 'GEN-CONTACTOR-18A' });
    await expect(row).toContainText('A-03-03');
    await r.hover(row, 600);
    await r.wait(2200);
    await page.keyboard.press('Escape');
  },

  // ---- the CAD workspace: on the empty first page of a new project, zoomed in ----
  cad: async ({ page, r, cap }) => {
    // A new project's third page is an empty power page.
    await r.gotoPage(3, 500);
    await r.fit();
    const cmd = page.getByTestId('cmd-input');
    const typeCmd = async (text: string) => {
      await cmd.pressSequentially(text, { delay: 110 });
      await r.wait(250);
      await cmd.press('Enter');
      await r.wait(350);
    };
    await r.clickOn(cmd, 600);
    await typeCmd('ZOOM');
    await typeCmd('20,30');
    await typeCmd('160,110');
    const at = await r.calibrate();
    await cap('line', true);
    await r.clickOn(cmd, 400);
    await typeCmd('L');
    await typeCmd('40,50');
    await typeCmd('@80,0');
    await cmd.press('Enter');
    await r.wait(800);
    await cap('rect', true);
    await typeCmd('REC');
    await typeCmd('40,65');
    await typeCmd('@80,30');
    await r.wait(900);
    await cap('snap', true);
    await typeCmd('L');
    const end = at(120, 50);
    await r.glide(end.x + 4, end.y + 3, 900);
    await r.wait(1600);
    await cmd.press('Escape');
    await page.keyboard.press('Escape');
    await cap('window', true);
    const a = at(32, 42), b = at(130, 102);
    await r.glide(a.x, a.y, 700);
    await page.mouse.down();
    await r.glide(b.x, b.y, 1100);
    await page.mouse.up();
    await r.wait(1000);
    await page.keyboard.press('Delete');
    await r.wait(1000);
    await page.keyboard.press('Control+z');
    await r.wait(1600);
  },

  // ---- the cabinet layout ----
  layout: async ({ page, r, cap, open, out }) => {
    await open('conveyor');
    await r.gotoPage(10, 500);
    await r.fit();
    const lc = page.getByTestId('cmd-input');
    await lc.fill('SELECTALL');
    await lc.press('Enter');
    await lc.fill('ERASE');
    await lc.press('Enter');
    await r.wait(600);
    await cap('suggest');
    await tab(page, 'layout');
    await r.clickOn(page.getByTestId('rb-suggest'), 700);
    await expect(page.getByTestId('chat-proposal').last()).toBeVisible();
    await r.wait(2200);
    await cap('accept');
    await r.clickOn(page.getByTestId('chat-accept'), 600);
    await r.wait(1600);
    await cap('move');
    await page.getByTestId('save').click();
    const doc = JSON.parse(readFileSync(join(out, readdirSync(out).find((f) => f.endsWith('.cablepilot.json'))!), 'utf8')) as { pages: { layout?: { view: string; w: number; h: number }; elements: { item?: string; designation?: string; x: number; y: number; w: number; h: number }[] }[] };
    const lp = doc.pages.find((p) => p.layout?.view === 'front')!;
    const dev = lp.elements.find((e) => e.item === 'device' && e.designation?.endsWith('-KM1'))!;
    const cb = (await page.getByTestId('page-canvas').boundingBox())!;
    const zoom = Number(/Zoom\s+(\d+)\s*%/.exec(await page.locator('body').innerText())![1]) / 100;
    const toScreen = (x: number, y: number) => ({ x: cb.x + cb.width / 2 + (x - lp.layout!.w / 2) * zoom, y: cb.y + cb.height / 2 + (y - lp.layout!.h / 2) * zoom });
    const from = toScreen(dev.x + dev.w / 2, dev.y + dev.h / 2);
    await r.glide(from.x, from.y, 800);
    await r.wait(300);
    await page.mouse.down();
    await r.glide(from.x + 70 * zoom, from.y + 14 * zoom, 1000);
    await r.wait(400);
    await page.mouse.up();
    await r.wait(1400);
    await page.keyboard.press('Escape');
    await cap('3d');
    await tab(page, 'layout');
    await r.clickOn(page.getByTestId('rb-3d'), 700);
    await expect(page.getByTestId('cabinet-3d').locator('canvas')).toBeVisible({ timeout: 30_000 });
    await r.wait(1000);
    const vb = (await page.getByTestId('cabinet-3d').boundingBox())!;
    await r.glide(vb.x + vb.width * 0.42, vb.y + vb.height * 0.5, 600);
    await page.mouse.down();
    await r.glide(vb.x + vb.width * 0.64, vb.y + vb.height * 0.4, 1500);
    await page.mouse.up();
    await r.wait(1600);
  },

  // ---- the assistant ----
  ai: async ({ page, lang, r, cap, open }) => {
    await open('conveyor');
    await r.gotoPage(5, 400);
    await r.fit();
    await cap('key', true);
    await r.clickOn(page.getByTestId('ai-settings-open'), 700);
    await r.clickOn(page.getByTestId('ai-key'), 500);
    await page.getByTestId('ai-key').pressSequentially('sk-ant-demo-key-0123456789abcdef', { delay: 14 });
    await r.clickOn(page.getByTestId('ai-key-save'), 600);
    await r.wait(1000);
    await page.keyboard.press('Escape');
    await cap('ask', true);
    const input = page.getByTestId('chat-input');
    await r.clickOn(input, 600);
    await input.pressSequentially(L(lang, 'add a star-delta starter for a 7.5 kW motor on page 5', 'aggiungi un avviatore stella-triangolo per un motore da 7,5 kW a pagina 5'), { delay: 28 });
    await r.clickOn(page.getByTestId('chat-send'), 500);
    await expect(page.getByTestId('chat-proposal').last()).toBeVisible();
    await cap('preview', true);
    await r.hover(page.getByTestId('chat-proposal').last(), 700);
    await r.wait(2600);
    await cap('accept', true);
    await r.clickOn(page.getByTestId('chat-accept'), 700);
    await r.wait(900);
    // The starter went on a new page 6 (page 5 is full): show it, then take it back.
    await r.gotoPage(6, 400);
    await r.fit();
    await r.wait(1800);
    await page.keyboard.press('Control+z');
    await r.wait(1600);
  },

  // ---- the ERP link ----
  erp: async ({ page, r, cap, open }) => {
    await open('conveyor');
    await cap('connect', true);
    await tab(page, 'reports');
    await r.clickOn(page.getByTestId('rb-erp'), 700);
    await r.clickOn(page.getByTestId('erp-demo'), 700);
    await expect(page.getByTestId('erp-demo-on')).toBeVisible();
    await r.wait(500);
    await r.clickOn(page.getByTestId('erp-test'), 600);
    await expect(page.getByTestId('erp-test-result')).toBeVisible();
    await r.wait(1400);
    await cap('pull', true);
    await r.clickOn(page.getByTestId('erp-pull'), 600);
    await expect(page.getByTestId('wh-wizard')).toBeVisible();
    await r.wait(1600);
    await r.clickOn(page.getByTestId('wh-import'), 600);
    await expect(page.getByTestId('wh-table')).toBeVisible();
    await r.wait(1400);
    await page.keyboard.press('Escape');
    await r.gotoPage(5, 400);
    await r.fit();
    await cap('pick', true);
    const motor = await r.mm(210, 234);
    await r.clickAt(motor.x, motor.y, 700);
    await expect(page.getByTestId('device-section')).toContainText('+DS-M1');
    await r.clickOn(page.getByTestId('device-pick-warehouse'), 700);
    const row = page.getByTestId('wh-table').locator('tbody tr', { hasText: 'LABEL-ROLL-WHITE' });
    await r.clickOn(row.getByTestId('wh-use'), 800);
    await r.wait(1000);
    await page.keyboard.press('Escape');
    await r.hover(page.getByTestId('device-parts'), 600);
    await r.wait(1000);
    await cap('reserve', true);
    await tab(page, 'reports');
    await r.clickOn(page.getByTestId('rb-reserve'), 700);
    await expect(page.getByTestId('res-table')).toBeVisible();
    await r.wait(1500);
    await r.clickOn(page.getByTestId('res-send'), 700);
    await expect(page.getByTestId('res-sent')).toBeVisible();
    await r.wait(2000);
  },
};

for (const clip of clips) {
  for (const lang of langs) {
    test(`clip ${clip.id} (${lang})`, async () => {
      test.skip(only.length > 0 && !only.includes(clip.id), 'not asked for');
      test.setTimeout(4 * 60_000);
      const run = SCRIPTS[clip.id];
      if (!run) throw new Error(`no script for clip ${clip.id}`);
      mkdirSync(outDir, { recursive: true });
      // A fresh profile in the clip's language.
      const profile = mkdtempSync(join(tmpdir(), 'cp-clip-'));
      writeFileSync(join(profile, 'settings.json'), JSON.stringify({ language: lang }));
      const rawDir = join(outDir, 'raw', `${clip.id}-${lang}`);
      const { app, page, out, close } = await launch({ profile, env: { CP_AI_FAKE: '1' }, recordVideo: { dir: rawDir, size: { width: W, height: H } } });
      const marks: Record<string, number> = {};
      try {
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1920, 1080));
        await page.setViewportSize({ width: W, height: H });
        const r = recorder(page, { title: clip.title[lang] });
        await r.install();
        marks.sync = await r.sync();
        await r.wait(400);
        const ctx: Ctx = {
          page, lang, out, r,
          cap: async (id, top = false) => {
            const c = clip.captions.find((x) => x.id === id);
            if (!c) throw new Error(`clip ${clip.id} has no caption ${id}`);
            marks[id] ??= Date.now();
            marks.start ??= Date.now();
            await r.say(c[lang], top);
          },
          open: async (sample) => {
            await page.getByTestId('samples').selectOption(sample);
            await expect(page.getByTestId('page-1')).toBeVisible();
            await r.wait(700);
          },
        };
        await run(ctx);
        if (clip.note) {
          marks.note = Date.now();
          await r.say(clip.note[lang], true);
          await r.wait(2600);
        }
        marks.end = Date.now();
      } finally {
        const video = page.video();
        marks.close = Date.now();
        await close();
        const path = video ? await video.path() : '';
        if (path) copyFileSync(path, join(outDir, `${clip.id}-${lang}.webm`));
        writeFileSync(join(outDir, `${clip.id}-${lang}.json`), JSON.stringify({ clip: clip.id, lang, marks }, null, 2));
      }
    });
  }
}
