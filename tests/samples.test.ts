// The sample projects: built with the editor's commands, written to /samples with
// UPDATE_SAMPLES=1, and checked here: the committed files are up to date, open, have sane
// connectivity and export to PDF.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectNets } from '@shared/connectivity';
import { parseProject, serializeProject } from '@shared/file';
import { exportPdf } from '@shared/pdf';
import { PDFDocument } from 'pdf-lib';
import { SAMPLES } from './support/samples';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const dir = join(__dirname, '..', 'samples');

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
});
