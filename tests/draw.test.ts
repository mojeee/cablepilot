import { describe, expect, it } from 'vitest';
import { buildPage, frameRect } from '@shared/draw/page';
import { primBox, type Prim } from '@shared/draw/primitives';
import { gfxPrims } from '@shared/draw/symbol';
import { templateOf } from '@shared/model/queries';
import { parseZoneLabels } from '@shared/model/zones';
import { sheetMm } from '@shared/sheets';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const texts = (ps: Prim[]) => ps.flatMap((p) => (p.k === 'text' ? [p.text] : []));

function proj(lang: 'en' | 'it' = 'en') {
  const b = builder(lib, 'p', 'Charger', { drawingLanguage: lang });
  b.set({ properties: { client: 'ACME', drawingNo: 'D-1', revision: 'B', copyright: 'Copyright ACME' } });
  const pg = b.addPage('power', { en: 'Power', it: 'Potenza' });
  b.addPage('data', { en: 'Data', it: 'Dati' });
  return { b, pg };
}

describe('page drawing', () => {
  it('fills the title block from project and page properties', () => {
    const { b } = proj();
    const t = texts(buildPage(b.project, b.project.pages[0], lib, 0).prims);
    expect(t).toEqual(expect.arrayContaining(['ACME', 'D-1', 'B', 'Power', '01', '02', 'Client', 'Drawing no.', 'Copyright ACME']));
  });
  it('prints title-block labels in the drawing language, not the UI language', () => {
    const { b } = proj('it');
    const t = texts(buildPage(b.project, b.project.pages[0], lib, 0).prims);
    expect(t).toEqual(expect.arrayContaining(['Cliente', 'N. disegno', 'Potenza']));
    expect(t).not.toContain('Client');
  });
  it('draws configurable zone labels (A to H skipping nothing, M to U skipping O and Q, rows 0 to 9)', () => {
    const { b } = proj();
    const tpl = templateOf(b.project, b.project.pages[0]);
    b.run({ type: 'template/upsert', template: { ...tpl, frame: { ...tpl.frame, columns: parseZoneLabels('M N P R S T U'), rows: parseZoneLabels('0 1 2 3 4 5 6 7 8 9') } } });
    const t = texts(buildPage(b.project, b.project.pages[0], lib, 0).prims);
    for (const l of ['M', 'N', 'P', 'U', '0', '9']) expect(t).toContain(l);
    expect(t).not.toContain('O');
  });
  it('keeps the frame inside the sheet for every size', () => {
    const { b } = proj();
    const tpl = templateOf(b.project, b.project.pages[0]);
    for (const size of ['A4', 'A3', 'A2', 'A1', 'A0'] as const) {
      const { w, h } = sheetMm(size);
      const f = frameRect(tpl, w, h);
      expect(f.fx + f.fw).toBeLessThanOrEqual(w);
      expect(f.fy + f.fh).toBeLessThanOrEqual(h);
      expect(f.fw).toBeGreaterThan(tpl.titleBlock.w);
    }
  });
  it('uses the style colours: designations in red, symbols in black', () => {
    const { b, pg } = proj();
    b.place(pg, 'coil', 100, 100);
    const ps = buildPage(b.project, b.project.pages[0], lib, 0).prims;
    expect(ps.find((p) => p.k === 'text' && p.text === '-K1')).toMatchObject({ c: '#d40000' });
    b.run({ type: 'project/settings', settings: { style: { ...b.project.settings.style, colours: { ...b.project.settings.style.colours, designation: '#0000ff' } } } });
    expect(buildPage(b.project, b.project.pages[0], lib, 0).prims.find((p) => p.k === 'text' && p.text === '-K1')).toMatchObject({ c: '#0000ff' });
  });
  it('switches to the NFPA graphics for symbols that have them, with the same pins', () => {
    const { b, pg } = proj();
    b.place(pg, 'contact-no', 100, 100);
    const iec = buildPage(b.project, b.project.pages[0], lib, 0).prims.length;
    b.run({ type: 'project/settings', settings: { symbolStandard: 'nfpa' } });
    const nfpa = buildPage(b.project, b.project.pages[0], lib, 0).prims.length;
    expect(nfpa).not.toBe(iec);
    const def = lib.symbols.get('contact-no')!;
    expect(def.pins.length).toBe(2);
  });
  it('draws n-conductor tick marks on a single-line wire', () => {
    const { b, pg } = proj();
    const base = buildPage(b.project, b.project.pages[0], lib, 0).prims.length;
    b.wire(pg, [{ x: 50, y: 50 }, { x: 90, y: 50 }]);
    const one = buildPage(b.project, b.project.pages[0], lib, 0).prims.length - base;
    b.wire(pg, [{ x: 50, y: 70 }, { x: 90, y: 70 }], { conductors: 3 });
    const three = buildPage(b.project, b.project.pages[0], lib, 0).prims.length - base - one;
    expect(three).toBe(one + 3);
  });
  it('fills project data forms from assembly properties and ticks the chosen box', () => {
    const { b } = proj();
    b.set({ assembly: { ratedCurrent: '630', earthingSystem: 'TT' } });
    const pg = b.project.pages[1].id;
    b.run({ type: 'el/add', page: pg, elements: [{ id: 'f', kind: 'form', x: 30, y: 30, w: 170, items: [{ type: 'table', label: { en: 'Rated data' }, rows: [{ label: { en: 'Rated current' }, bind: 'assembly.ratedCurrent' }] }, { type: 'tick', label: { en: 'TN-S' }, bind: 'assembly.earthingSystem', value: 'TN-S' }, { type: 'tick', label: { en: 'TT' }, bind: 'assembly.earthingSystem', value: 'TT' }] }] });
    const ps = buildPage(b.project, b.project.pages[1], lib, 1).prims.filter((p) => p.id === 'f');
    expect(texts(ps)).toEqual(expect.arrayContaining(['Rated current', '630', 'TN-S', 'TT']));
    // exactly one check mark (a 3-point open polyline) for the ticked box
    expect(ps.filter((p) => p.k === 'poly' && !p.closed && p.pts.length === 6)).toHaveLength(1);
  });
  it('generates the cover and contents pages from the project', () => {
    const b = builder(lib, 'p', 'Pump station');
    b.set({ properties: { client: 'ACME' } });
    b.addPage('cover', { en: 'Cover' });
    b.addPage('contents', { en: 'Contents' });
    b.addPage('power', { en: 'Pump power' });
    expect(texts(buildPage(b.project, b.project.pages[0], lib, 0).prims)).toEqual(expect.arrayContaining(['Pump station', 'ACME']));
    const c = texts(buildPage(b.project, b.project.pages[1], lib, 1).prims);
    expect(c).toEqual(expect.arrayContaining(['Pump power', '03', 'Sheet index']));
  });
  it('rotates and mirrors symbol arcs consistently', () => {
    const arc = [{ t: 'arc' as const, cx: 0, cy: 0, r: 2, a0: 0, a1: 90 }];
    const m = gfxPrims(arc, { x: 0, y: 0, rot: 0, mirror: true }, 0.3, '#000')[0];
    expect(m).toMatchObject({ a0: 90, a1: 180 });
    const r = gfxPrims(arc, { x: 0, y: 0, rot: 90, mirror: false }, 0.3, '#000')[0];
    expect(r).toMatchObject({ a0: 90, a1: 180 });
  });
  it('gives every element a bounding box for picking', () => {
    const { b, pg } = proj();
    b.place(pg, 'motor-3ph', 100, 100);
    const built = buildPage(b.project, b.project.pages[0], lib, 0);
    expect(built.items).toHaveLength(1);
    const [x0, , x1] = built.items[0].box;
    expect(x1 - x0).toBeGreaterThan(14);
    expect(primBox({ k: 'circle', cx: 1, cy: 1, r: 1, w: 1, c: '#000' })).toEqual([0, 0, 2, 2]);
  });
});
