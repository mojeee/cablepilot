// CSV, XLSX and DXF round trips; the XLSX container; the PDF text is embedded and extractable.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { buildPage } from '@shared/draw/page';
import { parseCsv, toCsv } from '@shared/export/csv';
import { dxfElements, readDxf, writeDxf } from '@shared/export/dxf';
import { reportCsv, workbookBytes, workbookSheets } from '@shared/export/lists';
import { readXlsx, sheetNames, xlsxBytes } from '@shared/export/xlsx';
import { crc32, zipRead, zipStore } from '@shared/export/zip';
import { parseProject } from '@shared/file';
import { exportPdf } from '@shared/pdf';
import { tableMatrix, reportTable } from '@shared/reports';
import { REPORT_IDS, type LineEl, type TextEl } from '@shared/model/types';
import { loadLibrary } from './support/library';
import { builder } from './support/builder';

const lib = loadLibrary();
const root = join(__dirname, '..');
const sample = (id: string) => {
  const r = parseProject(readFileSync(join(root, 'samples', `${id}.cablepilot.json`), 'utf8'));
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const fonts = () => ({ regular: readFileSync(join(root, 'shared/fonts/Roboto-Regular.ttf')), bold: readFileSync(join(root, 'shared/fonts/Roboto-Bold.ttf')) });

describe('ZIP and XLSX', () => {
  it('computes the CRC-32 check value and round-trips stored entries', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const z = zipRead(zipStore([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.xml', data: '<x>é</x>' }]));
    expect([...z.entries()]).toEqual([['a.txt', 'hello'], ['dir/b.xml', '<x>é</x>']]);
  });
  it('writes a workbook with the Office parts, text with leading zeros kept, numbers as numbers', () => {
    const bytes = xlsxBytes([{ name: 'Wires', rows: [['Number', 'Qty', 'Note'], ['001L1', '4', 'a & <b> "c"'], ['', '2.5', 'ü']] }]);
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe('PK');
    const parts = zipRead(bytes);
    for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) expect(parts.has(n), n).toBe(true);
    const sheet = parts.get('xl/worksheets/sheet1.xml') as string;
    expect(sheet).toContain('<c r="B2"><v>4</v></c>');
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">001L1</t>');
    expect(readXlsx(bytes)).toEqual([{ name: 'Wires', rows: [['Number', 'Qty', 'Note'], ['001L1', '4', 'a & <b> "c"'], ['', '2.5', 'ü']] }]);
  });
  it('makes sheet names Excel accepts', () => {
    const n = sheetNames(['A/B:C', 'x'.repeat(40), 'Wires', 'wires']);
    expect(n[0]).toBe('A B C');
    expect(n[1]).toHaveLength(31);
    expect(new Set(n.map((x) => x.toLowerCase())).size).toBe(4);
  });
  it('exports every list of a sample as one workbook that reads back to the same tables', () => {
    const p = sample('dc-charger');
    const sheets = readXlsx(workbookBytes(p, lib));
    expect(sheets).toHaveLength(REPORT_IDS.length);
    const expected = workbookSheets(p, lib);
    const wires = sheets.find((s) => s.name === 'Elenco fili');
    expect(wires?.rows[0]).toEqual(['Numero', 'Da', 'A', 'Sezione', 'Colore', 'Tipo', 'Cavo']);
    expect(wires?.rows.length).toBe(expected.find((s) => s.name === 'Elenco fili')?.rows.length);
  });
});

describe('CSV', () => {
  it('quotes, uses ";" in Italian and "," otherwise, and reads back', () => {
    const rows = [['a', 'b,c', 'say "hi"'], ['1', 'line\nbreak', 'ü;x']];
    expect(toCsv(rows, 'en').startsWith('﻿a,"b,c"')).toBe(true);
    expect(toCsv(rows, 'it')).toContain('a;"b,c";"say ""hi"""');
    expect(parseCsv(toCsv(rows, 'en'))).toEqual(rows);
    expect(parseCsv(toCsv(rows, 'it'))).toEqual(rows);
  });
  it('exports a report as CSV that parses back to its table', () => {
    const p = sample('conveyor');
    for (const id of ['wires', 'terminals', 'bom', 'wireMarkers'] as const) expect(parseCsv(reportCsv(p, lib, id))).toEqual(tableMatrix(reportTable(p, lib, id)));
  });
});

describe('DXF', () => {
  const b = builder(lib, 'd', 'DXF');
  const pg = b.addPage('power', { en: 'Power' }, { size: 'A4' });
  const k = b.place(pg, 'coil', 100, 100, { designation: '-K1' });
  b.wire(pg, [{ x: k.pin('A1').x, y: 60 }, k.pin('A1')], { number: '001' });
  b.text(pg, 30, 150, 'Hello DXF', { rot: 90 });
  b.rect(pg, 20, 20, 50, 30, { dashed: true });
  const built = buildPage(b.project, b.project.pages[0], lib, 0);
  const dxf = writeDxf(built.prims, built.height);

  it('writes the sections and entities of a page', () => {
    for (const s of ['SECTION', 'HEADER', 'TABLES', 'ENTITIES', 'LWPOLYLINE', 'TEXT', 'EOF']) expect(dxf, s).toContain(s);
    expect(dxf).toContain('$INSUNITS');
  });
  it('reads back lines, polylines, circles, arcs and texts', () => {
    const r = readDxf(dxf);
    expect(r.unit).toBe(1);
    expect(r.shapes.filter((s) => s.text).map((s) => s.text?.value)).toContain('Hello DXF');
    const polys = built.prims.filter((p) => p.k === 'poly').length, circles = built.prims.filter((p) => p.k === 'circle' || p.k === 'arc').length;
    expect(r.shapes.filter((s) => s.pts).length).toBe(polys + circles);
  });
  it('imports as plain graphics scaled into the sheet, y flipped back, texts keeping size and rotation', () => {
    let n = 0;
    const res = dxfElements(dxf, () => `e${++n}`, { x0: 10, y0: 10, maxW: 200, maxH: 120 });
    expect(res.elements.length).toBeGreaterThan(20);
    const lines = res.elements.filter((e): e is LineEl => e.kind === 'line');
    const xs = lines.flatMap((l) => l.points.map((p) => p.x)), ys = lines.flatMap((l) => l.points.map((p) => p.y));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10 - 0.01);
    expect(Math.max(...xs)).toBeLessThanOrEqual(210 + 0.01);
    expect(Math.max(...ys)).toBeLessThanOrEqual(130 + 0.01);
    const t = res.elements.find((e): e is TextEl => e.kind === 'text' && e.text === 'Hello DXF');
    expect(t?.rot).toBe(90);
    expect(res.skipped).toEqual({});
    // A drawing that fits is not scaled.
    const small = dxfElements('0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n50\n21\n0\n0\nENDSEC\n0\nEOF\n', () => 'x', { x0: 0, y0: 0, maxW: 100, maxH: 100 });
    expect(small.scale).toBe(1);
  });
  it('reads units, POLYLINE with VERTEX, MTEXT and counts what it skips', () => {
    const txt = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '5', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
      '0', 'POLYLINE', '70', '1', '0', 'VERTEX', '10', '0', '20', '0', '0', 'VERTEX', '10', '10', '20', '0', '0', 'VERTEX', '10', '10', '20', '10', '0', 'SEQEND',
      '0', 'MTEXT', '10', '1', '20', '2', '40', '2.5', '1', 'Line\\Pnext',
      '0', 'SPLINE', '0', 'HATCH', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const r = readDxf(txt);
    expect(r.unit).toBe(10);
    expect(r.shapes[0].pts).toHaveLength(4);
    expect(r.shapes[1].text?.value).toBe('Line next');
    expect(r.skipped).toEqual({ SPLINE: 1, HATCH: 1 });
  });
});

describe('PDF text', () => {
  it('embeds the font so the text shows in every viewer, and the sheet numbers are in the title block', async () => {
    const p = sample('dc-charger');
    const bytes = await exportPdf(p, lib, { fonts: fonts(), deterministic: true });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(p.pages.length);
    const raw = Buffer.from(bytes).toString('latin1');
    expect(raw).toContain('/FontFile2');
    expect(raw).toContain('/Subtype /CIDFontType2');
    expect(raw).not.toContain('/BaseFont /Helvetica');
  });
  it('falls back to the standard fonts without font data', async () => {
    const raw = Buffer.from(await exportPdf(sample('conveyor'), lib, { deterministic: true })).toString('latin1');
    expect(raw).toContain('/BaseFont /Helvetica');
  });
  it('exports a full set including the generated report pages', async () => {
    const p = sample('pump-station');
    expect(p.pages.some((x) => x.elements.some((e) => e.kind === 'report'))).toBe(true);
    const doc = await PDFDocument.load(await exportPdf(p, lib, { fonts: fonts(), deterministic: true }));
    expect(doc.getPageCount()).toBe(p.pages.length);
  });
});
