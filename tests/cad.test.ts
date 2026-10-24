// The CAD workspace's pure parts: typed input, command routing and aliases, object snap, ortho and polar,
// window versus crossing selection, TRIM / EXTEND / OFFSET, grips.
import { describe, expect, it } from 'vitest';
import { angleOf, dist, polar } from '@shared/cad/geom';
import { parsePointInput } from '@shared/cad/input';
import { autocomplete, CAD_COMMANDS, resolveCommand, routeInput } from '@shared/cad/commands';
import { DEFAULT_OSNAP, objectSnap, orthoPoint, polarPoint, resolvePoint, snapGeometry, type Aids, type OsnapMode } from '@shared/cad/snap';
import { isCrossing, rectOf, selectInRect } from '@shared/cad/select';
import { extendSegment, gripCommand, gripsOf, offsetCircle, offsetRect, offsetSegment, trimSegment } from '@shared/cad/modify';
import { apply } from '@shared/commands';
import { newPage } from '@shared/model/defaults';
import type { El, Page } from '@shared/model/types';
import { buildPage } from '@shared/draw/page';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const near = (a: { x: number; y: number }, x: number, y: number) => {
  expect(a.x).toBeCloseTo(x, 6);
  expect(a.y).toBeCloseTo(y, 6);
};

describe('typed point input', () => {
  const base = { x: 100, y: 100 };
  it('reads absolute and relative coordinates', () => {
    expect(parsePointInput('10,20', null)).toMatchObject({ ok: true, kind: 'absolute', pt: { x: 10, y: 20 } });
    expect(parsePointInput('@50,0', base)).toMatchObject({ ok: true, kind: 'relative', pt: { x: 150, y: 100 } });
    expect(parsePointInput('@-5.5, 10', base)).toMatchObject({ ok: true, pt: { x: 94.5, y: 110 } });
    expect(parsePointInput('@50,0', null)).toEqual({ ok: false });
  });
  it('reads relative polar input: angles run counter-clockwise, 90 is up the page', () => {
    const r = parsePointInput('@50<90', base);
    expect(r.ok && r.kind).toBe('polar');
    if (r.ok) near(r.pt, 100, 50);
    const r2 = parsePointInput('@10<0', base);
    if (r2.ok) near(r2.pt, 110, 100);
    const r3 = parsePointInput('@10<180', base);
    if (r3.ok) near(r3.pt, 90, 100);
  });
  it('treats a plain number as a distance toward the cursor (direct distance entry)', () => {
    const r = parsePointInput('30', base, { x: 100, y: 400 });
    expect(r.ok && r.kind).toBe('distance');
    if (r.ok) near(r.pt, 100, 130);
    expect(parsePointInput('30', base, base)).toEqual({ ok: false });
    expect(parsePointInput('30', null, base)).toEqual({ ok: false });
  });
  it('rejects text', () => {
    expect(parsePointInput('close', base)).toEqual({ ok: false });
    expect(parsePointInput('1,2,3', base)).toEqual({ ok: false });
  });
  it('angles and polar points agree', () => {
    const p = polar({ x: 0, y: 0 }, 10, 30);
    expect(angleOf({ x: 0, y: 0 }, p)).toBeCloseTo(30, 6);
    expect(dist({ x: 0, y: 0 }, p)).toBeCloseTo(10, 6);
  });
});

describe('command line routing and aliases', () => {
  it('knows the aliases CAD users type', () => {
    const want: Record<string, string> = { L: 'LINE', PL: 'PLINE', REC: 'RECTANGLE', C: 'CIRCLE', M: 'MOVE', CO: 'COPY', RO: 'ROTATE', MI: 'MIRROR', E: 'ERASE', TR: 'TRIM', EX: 'EXTEND', O: 'OFFSET', Z: 'ZOOM', ZE: 'EXTENTS', U: 'UNDO', PAN: 'PAN', LA: 'LAYER', DI: 'DIST' };
    for (const [alias, name] of Object.entries(want)) expect(resolveCommand(alias)?.name).toBe(name);
    expect(resolveCommand('l')?.name).toBe('LINE');
    for (const ours of ['INSERT', 'WIRE', 'NUMBER', 'REPORT', 'CHECK', 'SIZE']) expect(resolveCommand(ours)).toBeTruthy();
  });
  it('has no name or alias twice', () => {
    const words = CAD_COMMANDS.flatMap((c) => [c.name, ...c.aliases]);
    expect(new Set(words).size).toBe(words.length);
  });
  it('routes commands, unknown words and natural language', () => {
    expect(routeInput('L')).toMatchObject({ kind: 'command', command: { name: 'LINE' }, args: '' });
    expect(routeInput('zoom e')).toMatchObject({ kind: 'command', command: { name: 'ZOOM' }, args: 'e' });
    expect(routeInput('insert coil')).toMatchObject({ kind: 'command', command: { name: 'INSERT' }, args: 'coil' });
    expect(routeInput('lne')).toEqual({ kind: 'unknown', word: 'lne' });
    expect(routeInput('')).toEqual({ kind: 'empty' });
    // A command word followed by a sentence is a request to the assistant, not the command.
    expect(routeInput('number the wires on this page').kind).toBe('natural');
    expect(routeInput('size the feeder of -M1').kind).toBe('natural');
    expect(routeInput('add a star-delta starter for a 7.5 kW motor on page 5').kind).toBe('natural');
  });
  it('completes a typed prefix, best match first', () => {
    expect(autocomplete('rec')[0].word).toBe('REC');
    expect(autocomplete('rect').map((x) => x.word)).toContain('RECTANGLE');
    expect(autocomplete('')).toEqual([]);
    expect(autocomplete('rect')[0].command.name).toBe('RECTANGLE');
  });
});

function pageWith(els: El[]): Page {
  return { ...newPage('p', 'power', { en: 'P' }), elements: els };
}
const line = (id: string, a: [number, number], b: [number, number]): El => ({ id, kind: 'line', points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] });
const modes = (...m: OsnapMode[]) => new Set<OsnapMode>(m);

describe('object snap', () => {
  const page = pageWith([line('a', [0, 0], [100, 0]), line('b', [50, -50], [50, 50]), { id: 'r', kind: 'rect', x: 200, y: 0, w: 40, h: 20 }]);
  const g = snapGeometry(page, lib);
  it('snaps to endpoints, midpoints and intersections within the radius', () => {
    const e = objectSnap(g, { x: 2, y: 1 }, 4, modes('endpoint', 'midpoint', 'intersection'));
    expect(e).toMatchObject({ mode: 'endpoint', pt: { x: 0, y: 0 } });
    const i = objectSnap(g, { x: 51, y: 1 }, 4, modes('endpoint', 'midpoint', 'intersection'));
    expect(i).toMatchObject({ mode: 'intersection' });
    near(i!.pt, 50, 0);
    const m = objectSnap(g, { x: 49, y: 1 }, 4, modes('midpoint'));
    expect(m?.mode).toBe('midpoint');
    near(m!.pt, 50, 0);
    expect(objectSnap(g, { x: 30, y: 20 }, 4, modes('endpoint', 'midpoint', 'intersection'))).toBeNull();
  });
  it('snaps to rectangle corners and midpoints of its sides', () => {
    expect(objectSnap(g, { x: 201, y: 1 }, 4, modes('endpoint'))?.pt).toEqual({ x: 200, y: 0 });
    near(objectSnap(g, { x: 220, y: 1 }, 4, modes('midpoint'))!.pt, 220, 0);
  });
  it('finds the perpendicular foot from the last point, and the nearest point on a line', () => {
    const p = objectSnap(g, { x: 70, y: 1 }, 4, modes('perpendicular'), { x: 70, y: 40 });
    expect(p?.mode).toBe('perpendicular');
    near(p!.pt, 70, 0);
    expect(objectSnap(g, { x: 70, y: 1 }, 4, modes('perpendicular'))).toBeNull();
    const n = objectSnap(g, { x: 33, y: 2 }, 4, modes('nearest'));
    near(n!.pt, 33, 0);
  });
  it('snaps to connection points of symbols (their pins) before other modes', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('power', { en: 'P' });
    const k = b.place(pg, 'coil', 60, 60);
    const pin = k.pin('A1');
    const geom = snapGeometry(b.project.pages[0], lib);
    const hit = objectSnap(geom, { x: pin.x + 1, y: pin.y + 1 }, 4, modes('connection', 'endpoint'));
    expect(hit).toMatchObject({ mode: 'connection', via: 'pin', pt: pin });
  });
  it('honours the enabled modes', () => {
    expect(objectSnap(g, { x: 2, y: 1 }, 4, modes('midpoint'))).toBeNull();
  });
});

describe('ortho, polar and the resolved cursor', () => {
  const aids = (p: Partial<Aids> = {}): Aids => ({ snap: true, ortho: false, polar: false, polarStep: 45, osnap: false, modes: new Set(DEFAULT_OSNAP), ...p });
  const base = { x: 10, y: 10 };
  it('ortho keeps the longer axis', () => {
    expect(orthoPoint(base, { x: 40, y: 14 })).toEqual({ x: 40, y: 10 });
    expect(orthoPoint(base, { x: 13, y: 60 })).toEqual({ x: 10, y: 60 });
  });
  it('polar tracking snaps near multiples of the increment and leaves other angles alone', () => {
    const r = polarPoint(base, { x: 40, y: -18 }, 45); // about 43 degrees up
    expect(r.angle).toBe(45);
    expect(dist(base, r.pt)).toBeCloseTo(dist(base, { x: 40, y: -18 }), 6);
    expect(angleOf(base, r.pt)).toBeCloseTo(45, 6);
    expect(polarPoint(base, { x: 40, y: -5 }, 45).angle).toBeNull();
    expect(polarPoint(base, { x: 40, y: 10 }, 45).angle).toBe(0);
  });
  it('resolves object snap first, then ortho, then the grid', () => {
    const g = snapGeometry(pageWith([line('a', [0, 0], [100, 0])]), lib);
    expect(resolvePoint({ x: 1, y: 1 }, base, aids({ osnap: true }), g, 4).on).toBe('endpoint');
    const o = resolvePoint({ x: 41.1, y: 13 }, base, aids({ ortho: true }), null, 4);
    expect(o.on).toBe('ortho');
    expect(o.pt).toEqual({ x: 40, y: 10 });
    expect(resolvePoint({ x: 41.1, y: 13.9 }, null, aids(), null, 4)).toMatchObject({ on: 'grid', pt: { x: 40, y: 15 } });
    expect(resolvePoint({ x: 41.123, y: 13.9 }, null, aids({ snap: false }), null, 4)).toMatchObject({ on: 'free', pt: { x: 41.12, y: 13.9 } });
  });
  it('polar tracking returns the ray it follows', () => {
    const r = resolvePoint({ x: 40, y: 10.5 }, base, aids({ polar: true }), null, 4);
    expect(r.on).toBe('polar');
    expect(r.track).toEqual({ from: base, angle: 0 });
  });
});

describe('window and crossing selection', () => {
  const page = pageWith([
    { id: 'in', kind: 'rect', x: 10, y: 10, w: 10, h: 10 },
    { id: 'half', kind: 'rect', x: 40, y: 10, w: 30, h: 10 },
    line('ln', [0, 50], [200, 50]),
    { id: 'txt', kind: 'text', x: 15, y: 90, rot: 0, text: 'Hello', size: 3.5, align: 'left' },
  ]);
  const b = builder(lib, 'p', 'T');
  void b;
  const items = [
    { id: 'in', box: [10, 10, 20, 20] as [number, number, number, number] },
    { id: 'half', box: [40, 10, 70, 20] as [number, number, number, number] },
    { id: 'ln', box: [0, 50, 200, 50] as [number, number, number, number] },
    { id: 'txt', box: [15, 87, 30, 91] as [number, number, number, number] },
  ];
  it('decides by the drag direction', () => {
    expect(isCrossing({ x: 0, y: 0 }, { x: 10, y: 10 })).toBe(false);
    expect(isCrossing({ x: 10, y: 0 }, { x: 0, y: 10 })).toBe(true);
    expect(rectOf({ x: 9, y: 8 }, { x: 1, y: 2 })).toEqual([1, 2, 9, 8]);
  });
  it('a window takes only what lies completely inside', () => {
    expect(selectInRect(page, items, [0, 0, 55, 60], false)).toEqual(['in']);
    expect(selectInRect(page, items, [0, 0, 300, 100], false).sort()).toEqual(['half', 'in', 'ln', 'txt']);
  });
  it('a crossing takes everything it touches, but a line only where the line is', () => {
    expect(selectInRect(page, items, [0, 0, 55, 60], true).sort()).toEqual(['half', 'in', 'ln']);
    // Over the empty interior of the rectangle 'half', away from its border and from the line: nothing.
    expect(selectInRect(page, items, [50, 12, 60, 18], true)).toEqual([]);
    expect(selectInRect(page, items, [14, 86, 16, 88], true)).toEqual(['txt']);
  });
  it('leaves out elements on layers that are off or locked', () => {
    expect(selectInRect(page, items, [0, 0, 300, 100], false, new Set(['in', 'txt'])).sort()).toEqual(['in', 'txt']);
  });
});

describe('trim, extend and offset', () => {
  const edges = [{ a: { x: 20, y: -10 }, b: { x: 20, y: 10 }, id: 'e1' }, { a: { x: 60, y: -10 }, b: { x: 60, y: 10 }, id: 'e2' }];
  const A = { x: 0, y: 0 }, B = { x: 100, y: 0 };
  it('trims the part between two edges and keeps the rest as two lines', () => {
    const r = trimSegment(A, B, edges, { x: 40, y: 0 })!;
    expect(r).toEqual([[A, { x: 20, y: 0 }], [{ x: 60, y: 0 }, B]]);
  });
  it('trims the end beyond the nearest edge', () => {
    expect(trimSegment(A, B, edges, { x: 90, y: 0 })).toEqual([[A, { x: 60, y: 0 }]]);
    expect(trimSegment(A, B, edges, { x: 5, y: 0 })).toEqual([[{ x: 20, y: 0 }, B]]);
    expect(trimSegment(A, B, [], { x: 5, y: 0 })).toBeNull();
  });
  it('extends the end nearer the pick up to the nearest boundary beyond it', () => {
    const bounds = [{ a: { x: 130, y: -20 }, b: { x: 130, y: 20 }, id: 'b' }, { a: { x: 180, y: -20 }, b: { x: 180, y: 20 }, id: 'c' }];
    const r = extendSegment(A, B, bounds, { x: 95, y: 0 })!;
    expect(r[0]).toEqual(A);
    near(r[1], 130, 0);
    expect(extendSegment(A, B, bounds, { x: 5, y: 0 })).toBeNull();
  });
  it('offsets a line to the picked side, and a rectangle or circle outwards or inwards', () => {
    const [a, b] = offsetSegment(A, B, 5, { x: 50, y: 30 });
    near(a, 0, 5); near(b, 100, 5);
    const [c, d] = offsetSegment(A, B, 5, { x: 50, y: -30 });
    near(c, 0, -5); near(d, 100, -5);
    const r = { x: 10, y: 10, w: 40, h: 20 };
    expect(offsetRect(r, 2, { x: 0, y: 0 })).toEqual({ x: 8, y: 8, w: 44, h: 24 });
    expect(offsetRect(r, 2, { x: 30, y: 20 })).toEqual({ x: 12, y: 12, w: 36, h: 16 });
    expect(offsetRect(r, 12, { x: 30, y: 20 })).toBeNull();
    expect(offsetCircle({ x: 0, y: 0, r: 10 }, 3, { x: 20, y: 0 })).toBe(13);
    expect(offsetCircle({ x: 0, y: 0, r: 10 }, 3, { x: 2, y: 0 })).toBe(7);
    expect(offsetCircle({ x: 0, y: 0, r: 10 }, 12, { x: 2, y: 0 })).toBeNull();
  });
});

describe('grips', () => {
  const page = pageWith([line('l', [0, 0], [50, 0]), { id: 'r', kind: 'rect', x: 10, y: 10, w: 20, h: 10 }, { id: 'c', kind: 'circle', x: 100, y: 100, r: 10 }]);
  const el = (id: string) => page.elements.find((e) => e.id === id)!;
  const project = () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('power', { en: 'P' });
    b.run({ type: 'el/add', page: pg, elements: page.elements });
    return { p: b.project, pg };
  };
  it('lists the stretch points of lines, rectangles and circles', () => {
    expect(gripsOf(el('l')).map((g) => g.pt)).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }]);
    expect(gripsOf(el('r'))).toHaveLength(4);
    expect(gripsOf(el('c')).map((g) => g.role)).toEqual(['move', 'radius']);
  });
  it('stretches a line end, resizes a rectangle from the opposite corner, and sets a circle radius', () => {
    const { p, pg } = project();
    const stretched = apply(p, gripCommand(pg, el('l'), 1, { x: 80, y: 10 })!, { lib });
    expect((stretched.pages[0].elements[0] as { points: unknown }).points).toEqual([{ x: 0, y: 0 }, { x: 80, y: 10 }]);
    const sized = apply(p, gripCommand(pg, el('r'), 2, { x: 50, y: 40 })!, { lib });
    expect(sized.pages[0].elements[1]).toMatchObject({ x: 10, y: 10, w: 40, h: 30 });
    const radius = apply(p, gripCommand(pg, el('c'), 1, { x: 125, y: 100 })!, { lib });
    expect(radius.pages[0].elements[2]).toMatchObject({ r: 25 });
    expect(gripCommand(pg, el('l'), 0, { x: 0, y: 0 })).toBeNull();
  });
  it('a rectangle dragged past the opposite corner flips instead of going negative', () => {
    const { p, pg } = project();
    const flipped = apply(p, gripCommand(pg, el('r'), 2, { x: 0, y: 5 })!, { lib });
    expect(flipped.pages[0].elements[1]).toMatchObject({ x: 0, y: 5, w: 10, h: 5 });
  });
});

describe('circles in the drawing', () => {
  it('a circle element is drawn as a circle primitive and moves with the move command', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('power', { en: 'P' });
    b.run({ type: 'el/add', page: pg, elements: [{ id: 'c', kind: 'circle', x: 50, y: 50, r: 8 }] });
    b.run({ type: 'el/move', page: pg, ids: ['c'], dx: 5, dy: -5 });
    const built = buildPage(b.project, b.project.pages[0], lib, 0);
    expect(built.prims.some((p) => p.k === 'circle' && p.cx === 55 && p.cy === 45 && p.r === 8)).toBe(true);
    expect(built.items.some((i) => i.id === 'c')).toBe(true);
  });
});
