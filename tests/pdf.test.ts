import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { MM_TO_PT, exportPdf, pdfSafeText } from '@shared/pdf';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
function project() {
  const b = builder(lib, 'p', 'PDF test', { drawingLanguage: 'it' });
  b.set({ properties: { client: 'Città Società' } });
  const a = b.addPage('power', { en: 'Power', it: 'Potenza' }, { size: 'A3' });
  b.addPage('control', { en: 'Control' }, { size: 'A4' });
  const k = b.place(a, 'coil', 100, 100, { functionText: { it: 'Contattore principale' } });
  b.place(a, 'motor-3ph', 150, 120);
  b.wire(a, [{ x: k.pin('A1').x, y: 60 }, k.pin('A1')]);
  b.rect(a, 20, 20, 50, 30, { dashed: true });
  b.warning(a, 200, 80, 'hot');
  return b.project;
}

describe('PDF export', () => {
  it('writes one page per sheet at true scale', async () => {
    const bytes = await exportPdf(project(), lib, { deterministic: true });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const [a3, a4] = doc.getPages().map((p) => p.getSize());
    expect(a3.width).toBeCloseTo(420 * MM_TO_PT, 6);
    expect(a3.height).toBeCloseTo(297 * MM_TO_PT, 6);
    expect(a4.width).toBeCloseTo(297 * MM_TO_PT, 6);
  });
  it('is vector: paths and text operators, no raster images', async () => {
    const bytes = await exportPdf(project(), lib, { deterministic: true });
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).toContain('Tj');
    expect(text).not.toContain('/Subtype /Image');
    expect(text).toMatch(/\d+ \d+ m\b|\d \d+ m\b| m\n/);
  });
  it('exports chosen pages, deterministically', async () => {
    const p = project();
    const one = await exportPdf(p, lib, { pageIds: [p.pages[1].id], deterministic: true });
    expect((await PDFDocument.load(one)).getPageCount()).toBe(1);
    const again = await exportPdf(p, lib, { pageIds: [p.pages[1].id], deterministic: true });
    expect(Buffer.from(one).equals(Buffer.from(again))).toBe(true);
  });
  it('embeds PNG images and survives text the standard fonts cannot show', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const b = builder(lib, 'p', 'Img Ω ≠');
    b.run({ type: 'asset/add', id: 'a', asset: { name: 'x.png', mime: 'image/png', data: png, w: 1, h: 1 } });
    const pg = b.addPage('layout', { en: 'Layout' });
    b.run({ type: 'el/add', page: pg, elements: [{ id: 'i', kind: 'image', x: 20, y: 20, w: 40, h: 40, assetId: 'a' }] });
    const text = Buffer.from(await exportPdf(b.project, lib, { deterministic: true })).toString('latin1');
    expect(text).toContain('/Subtype /Image');
    expect(pdfSafeText('Ω ≠ ok à')).toBe('ohm ? ok à');
  });
});
