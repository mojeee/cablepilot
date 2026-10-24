// The sample projects: built with the editor's commands, written to /samples with
// UPDATE_SAMPLES=1, and checked here: the committed files are up to date, open, have sane
// connectivity and export to PDF.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { netGroups, projectNets } from '@shared/connectivity';
import { computeBom } from '@shared/bom';
import { deviceIndex } from '@shared/devices';
import { parseProject, serializeProject } from '@shared/file';
import { exportPdf } from '@shared/pdf';
import { PDFDocument } from 'pdf-lib';
import { MACROS, SAMPLES } from './support/samples';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const dir = join(__dirname, '..', 'samples');
const macroDir = join(__dirname, '..', 'library', 'macros');

describe('library macros', () => {
  for (const m of MACROS) {
    it(`${m.file} is committed and up to date (UPDATE_SAMPLES=1 npx vitest run tests/samples.test.ts)`, () => {
      const text = `${JSON.stringify(m.build(lib), null, 2)}\n`;
      const path = join(macroDir, `${m.file}.json`);
      if (process.env.UPDATE_SAMPLES) writeFileSync(path, text);
      expect(readFileSync(path, 'utf8')).toBe(text);
    });
  }
});

describe('sample projects', () => {
  for (const s of SAMPLES) {
    const path = join(dir, `${s.file}.cablepilot.json`);
    const built = s.build(lib);
    const text = serializeProject(built);
    if (process.env.UPDATE_SAMPLES) writeFileSync(path, text);
    describe(s.file, () => {
      it('is committed and up to date (run: UPDATE_SAMPLES=1 npx vitest run tests/samples.test.ts)', () => {
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path, 'utf8')).toBe(text);
      });
      it('opens', () => {
        const r = parseProject(readFileSync(path, 'utf8'));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.pages.length).toBeGreaterThanOrEqual(8);
      });
      it('has every page type it promises and no unknown symbols', () => {
        const types = new Set(built.pages.map((p) => p.type));
        for (const t of ['cover', 'contents', 'data', 'singleLine', 'power', 'control', 'plc', 'terminals', 'cables', 'layout']) expect(types.has(t as never), t).toBe(true);
        for (const pg of built.pages) for (const e of pg.elements) if (e.kind === 'symbol') expect(lib.symbols.has(e.symbolId), e.symbolId).toBe(true);
      });
      it('connects without two potentials short-circuited', () => {
        const nets = projectNets(built, lib);
        expect(nets.length).toBeGreaterThan(10);
        expect(nets.filter((n) => n.conflict).map((n) => n.id)).toEqual([]);
      });
      it('exports to a PDF with one page per sheet', async () => {
        const doc = await PDFDocument.load(await exportPdf(built, lib, { deterministic: true }));
        expect(doc.getPageCount()).toBe(built.pages.length);
      });
    });
  }
  it('the conveyor start/stop circuit puts the coil between 24 V and 0 V', () => {
    const p = SAMPLES[0].build(lib);
    const control = p.pages.find((pg) => pg.type === 'control')!;
    const nets = projectNets(p, lib).filter((n) => n.page === control.id);
    const coil = control.elements.find((e) => e.kind === 'symbol' && e.symbolId === 'coil')!;
    const withPin = (pin: string) => nets.find((n) => n.pins.some((x) => x.element === coil.id && x.pin === pin));
    expect(withPin('A2')?.potential).toBe('0V');
    expect(withPin('A1')?.potential).toBeUndefined();
  });

  it('every device of the samples has a part, and the BOM counts each device once', () => {
    for (const x of SAMPLES) {
      const p = x.build(lib);
      const bom = computeBom(p, lib);
      expect(bom.missing, x.file).toBe(0);
      const keys = bom.rows.filter((r) => r.designation).map((r) => r.designation);
      expect(keys.length).toBeGreaterThan(8);
      expect(bom.rows.some((r) => !r.designation && r.code), 'project-level parts').toBe(true);
      expect(deviceIndex(p, lib).devices.some((d) => d.reps.length > 1), 'linked representations').toBe(true);
    }
  });
  it('the pump star-delta starter connects as designed: delta U1-W2 V1-U2 W1-V2, star ties W2 U2 V2', () => {
    const p = SAMPLES[1].build(lib);
    const pw = p.pages.find((pg) => pg.type === 'power')!;
    const nets = projectNets(p, lib).filter((n) => n.page === pw.id);
    const el = (des: string) => pw.elements.find((e) => e.kind === 'symbol' && e.designation === des)!.id;
    const netOf = (des: string, pin: string) => nets.find((n) => n.pins.some((q) => q.element === el(des) && q.pin === pin))!.id;
    expect(netOf('-KM2', '1')).toBe(netOf('-M1', 'U1'));
    expect(netOf('-KM2', '2')).toBe(netOf('-M1', 'W2'));
    expect(netOf('-KM2', '4')).toBe(netOf('-M1', 'U2'));
    expect(netOf('-KM2', '6')).toBe(netOf('-M1', 'V2'));
    expect(netOf('-KM3', '2')).toBe(netOf('-KM3', '4'));
    expect(netOf('-KM3', '4')).toBe(netOf('-KM3', '6'));
    expect(netOf('-KM3', '1')).toBe(netOf('-M1', 'W2'));
    expect(netOf('-M1', 'U2')).not.toBe(netOf('-M1', 'W2'));
    expect(nets.filter((n) => n.conflict)).toEqual([]);
  });
  it('the charger joins pages by interruption points and a mated plug and socket, and reads [08-E3] style references', () => {
    const p = SAMPLES[2].build(lib);
    const groups = netGroups(p, lib);
    expect(groups.find((g) => g.signals.includes('IOUT'))?.pages).toHaveLength(2);
    expect(groups.find((g) => g.signals.includes('L+'))?.potentials).toEqual(['L+']);
    expect(groups.filter((g) => g.conflict)).toEqual([]);
    // Plug -X11 pin 1 (relay K1 contact) and socket -X10 pin 1 (PLC input I0.0) are one group.
    const x11 = p.pages.flatMap((pg) => pg.elements.map((e) => ({ pg, e }))).find((o) => o.e.kind === 'box' && o.e.designation === '-X11')!;
    const x10 = p.pages.flatMap((pg) => pg.elements.map((e) => ({ pg, e }))).find((o) => o.e.kind === 'box' && o.e.designation === '-X10')!;
    const nets = projectNets(p, lib);
    const net = (pg: string, el: string) => nets.find((n) => n.page === pg && n.pins.some((q) => q.element === el && q.pin === '1'))!.id;
    const g = groups.find((gr) => gr.nets.includes(net(x11.pg.id, x11.e.id)))!;
    expect(g.nets).toContain(net(x10.pg.id, x10.e.id));
    const coil = deviceIndex(p, lib).byKey.get('+DS-K1')!.reps.find((r) => r.role === 'coil')!;
    expect(coil.position).toMatch(/^08-[A-HMNPRSTU][0-9]$/);
    const tpl = p.templates[0].frame;
    expect(tpl.columns.join('')).toBe('ABCDEFGHMNPRSTU');
    expect(tpl.rows.join('')).toBe('0123456789');
  });
});
