// M8 part 2, parity with a panel designer: inserting a symbol onto a wire cuts the wire between its pins (and the
// numbers follow), and auto-wire connects the selected symbols in sequence.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HistoryService, KEEP_DAILY } from '../app/main/history';
import { autoWire } from '@shared/autowire';
import { apply } from '@shared/commands';
import { projectNets } from '@shared/connectivity';
import { deviceIndex } from '@shared/devices';
import { serializeProject, validateProject } from '@shared/file';
import { defaultLadder, rungAt, rungCount, rungs } from '@shared/ladder';
import { NUMBERING_PRESETS, subLetter } from '@shared/wires';
import { breakWire, distanceAlong, subPolyline } from '@shared/geometry/wires';
import type { Page, SymbolEl, WireEl } from '@shared/model/types';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const wiresOf = (pg: Page | undefined) => (pg?.elements ?? []).filter((e): e is WireEl => e.kind === 'wire');
const sym = (id: string, symbolId: string, x: number, y: number): SymbolEl => ({ id, kind: 'symbol', symbolId, x, y, rot: 0, mirror: false, designation: '' });

describe('wire geometry', () => {
  const pts = [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 30, y: 20 }];
  it('measures along a polyline and cuts a piece out of it', () => {
    expect(distanceAlong({ x: 0, y: 10 }, pts)).toBe(10);
    expect(distanceAlong({ x: 10, y: 20 }, pts)).toBe(30);
    expect(distanceAlong({ x: 5, y: 5 }, pts)).toBeUndefined();
    expect(subPolyline(pts, 10, 30)).toEqual([{ x: 0, y: 10 }, { x: 0, y: 20 }, { x: 10, y: 20 }]);
  });
  it('keeps the wire before the first pin and makes a new wire after the last one, without its number', () => {
    const w: WireEl = { id: 'w1', kind: 'wire', points: [{ x: 50, y: 20 }, { x: 50, y: 80 }], potential: '24VDC', number: '7', wireType: 't' };
    const r = breakWire(w, [{ x: 50, y: 45 }, { x: 50, y: 55 }], 'w1-s');
    expect(r).toEqual([
      { id: 'w1', kind: 'wire', points: [{ x: 50, y: 20 }, { x: 50, y: 45 }], potential: '24VDC', number: '7', wireType: 't' },
      { id: 'w1-s', kind: 'wire', points: [{ x: 50, y: 55 }, { x: 50, y: 80 }], potential: '24VDC', wireType: 't' },
    ]);
    expect(breakWire(w, [{ x: 50, y: 45 }], 'x')).toBeNull(); // one pin taps the wire, nothing to cut
    expect(breakWire(w, [{ x: 50, y: 20 }, { x: 50, y: 30 }], 'x')).toEqual([{ ...w, points: [{ x: 50, y: 30 }, { x: 50, y: 80 }] }]);
  });
});

describe('inserting a symbol onto a wire', () => {
  const make = (numbered: boolean) => {
    const b = builder(lib, 't', 'T');
    const pg = b.addPage('control', { en: 'Control' });
    b.wire(pg, [{ x: 100, y: 40 }, { x: 100, y: 120 }], numbered ? { number: '1' } : {});
    return { b, pg };
  };
  it('cuts the wire between the pins, so the contact is in series instead of shorted', () => {
    const { b, pg } = make(false);
    b.run({ type: 'symbol/place', page: pg, element: sym('k', 'contact-no', 100, 80), breakWires: true });
    const page = b.project.pages.find((p) => p.id === pg);
    expect(wiresOf(page).map((w) => w.points)).toEqual([[{ x: 100, y: 40 }, { x: 100, y: 75 }], [{ x: 100, y: 85 }, { x: 100, y: 120 }]]);
    // Two nets now, one on each side of the contact.
    expect(projectNets(b.project, lib).filter((n) => n.page === pg)).toHaveLength(2);
  });
  it('without breakWires the pins just join the wire (the old behaviour, still used by imports and macros)', () => {
    const { b, pg } = make(false);
    b.run({ type: 'symbol/place', page: pg, element: sym('k', 'contact-no', 100, 80) });
    expect(wiresOf(b.project.pages.find((p) => p.id === pg))).toHaveLength(1);
  });
  it('gives the new piece its own number when the wire was numbered automatically, in the same step', () => {
    const { b, pg } = make(true);
    b.run({ type: 'wire/renumber' });
    const before = b.project;
    b.run({ type: 'symbol/place', page: pg, element: sym('k', 'contact-no', 100, 80), breakWires: true });
    const nums = wiresOf(b.project.pages.find((p) => p.id === pg)).map((w) => w.number);
    expect(nums).toHaveLength(2);
    expect(nums.every(Boolean)).toBe(true);
    expect(new Set(nums).size).toBe(2);
    expect(before).not.toBe(b.project);
  });
  it('a 3-pole device over three wires cuts each of them', () => {
    const b = builder(lib, 't', 'T');
    const pg = b.addPage('power', { en: 'Power' });
    for (const x of [95, 100, 105]) b.wire(pg, [{ x, y: 20 }, { x, y: 100 }]);
    const p = apply(b.project, { type: 'symbol/place', page: pg, element: sym('km', 'contactor-3p', 100, 60), breakWires: true }, { lib });
    expect(wiresOf(p.pages.find((x) => x.id === pg))).toHaveLength(6);
  });
});

describe('auto-wire', () => {
  it('wires a column of symbols top to bottom, pole by pole, with a jog where they are not in line', () => {
    const b = builder(lib, 't', 'T');
    const pg = b.addPage('power', { en: 'Power' });
    const q = b.place(pg, 'mcb-3p', 100, 40);
    const k = b.place(pg, 'contactor-3p', 100, 80);
    const m = b.place(pg, 'contact-no', 130, 120);
    const page = b.project.pages.find((p) => p.id === pg)!;
    const paths = autoWire(page, lib, [k.id, q.id, m.id]);
    // Three poles from the breaker to the contactor, then one wire from the contactor's nearest free pole to the contact.
    expect(paths).toHaveLength(4);
    expect(paths.slice(0, 3).map((p) => [p[0], p[p.length - 1]])).toEqual([
      [q.pin('2'), k.pin('1')],
      [q.pin('4'), k.pin('3')],
      [q.pin('6'), k.pin('5')],
    ]);
    const last = paths[3];
    expect(last[0]).toEqual(k.pin('6'));
    expect(last[last.length - 1]).toEqual(m.pin('1'));
    expect(last).toHaveLength(4);
    for (const p of paths) for (let i = 1; i < p.length; i++) expect(p[i].x === p[i - 1].x || p[i].y === p[i - 1].y).toBe(true);
  });
  it('wires a row left to right and leaves pins that are already connected', () => {
    const b = builder(lib, 't', 'T');
    const pg = b.addPage('control', { en: 'Control' });
    const a = b.place(pg, 'contact-no', 50, 50, { rot: 270 });
    const c = b.place(pg, 'contact-no', 90, 50, { rot: 270 });
    const page = b.project.pages.find((p) => p.id === pg)!;
    const paths = autoWire(page, lib, [a.id, c.id]);
    expect(paths).toHaveLength(1);
    expect(paths[0][0].x).toBeLessThan(paths[0][1].x);
    b.wire(pg, paths[0]);
    expect(autoWire(b.project.pages.find((p) => p.id === pg)!, lib, [a.id, c.id])).toEqual([]);
  });
  it('needs two symbols', () => {
    const b = builder(lib, 't', 'T');
    const pg = b.addPage('control', { en: 'Control' });
    const a = b.place(pg, 'contact-no', 50, 50);
    expect(autoWire(b.project.pages.find((p) => p.id === pg)!, lib, [a.id])).toEqual([]);
  });
});

describe('ladder pages', () => {
  const make = () => {
    const b = builder(lib, 't', 'T');
    b.addPage('power', { en: 'Power' });
    const pg = b.addPage('control', { en: 'Control' });
    const page = () => b.project.pages.find((p) => p.id === pg)!;
    b.run({ type: 'page/ladder', id: pg, ladder: defaultLadder(b.project, page()), rails: { left: '24VDC', right: '0V' } });
    return { b, pg, page };
  };
  it('defaults to rails inside the frame, rungs every 10 mm and line numbers of page × 100', () => {
    const { page } = make();
    const l = page().ladder!;
    expect(l.first).toBe(200);
    expect(l.spacing).toBe(10);
    expect(l.right).toBeGreaterThan(l.left);
    expect(rungCount(l)).toBeGreaterThan(10);
    expect(rungs(l)[1]).toEqual({ n: 201, y: l.top + 10 });
    expect(rungAt(page(), l.top + 14)).toBe(201);
    expect(rungAt(page(), l.top - 50)).toBe(200);
    expect(rungAt({ ...page(), ladder: undefined }, 50)).toBeUndefined();
  });
  it('draws the rails as wires with their potentials, and LADDER OFF takes them away again', () => {
    const { b, pg, page } = make();
    expect(wiresOf(page()).map((w) => [w.id, w.potential])).toEqual([[`${pg}-rail-l`, '24VDC'], [`${pg}-rail-r`, '0V']]);
    b.run({ type: 'page/ladder', id: pg, ladder: null });
    expect(page().ladder).toBeUndefined();
    expect(wiresOf(page())).toEqual([]);
  });
  it('gives devices their line number as position, so cross-references read "203"', () => {
    const { b, pg, page } = make();
    const l = page().ladder!;
    b.place(pg, 'coil', l.right - 20, l.top + 30, { designation: '-K1' });
    b.place(pg, 'contact-no', l.left + 20, l.top + 50, { designation: '-K1' });
    const dev = deviceIndex(b.project, lib).byKey.get('-K1')!;
    expect(dev.reps.map((r) => r.position).sort()).toEqual(['203', '205']);
  });
  it('numbers wires by rung: the line number, then A, B for more wires on the same rung', () => {
    const { b, pg, page } = make();
    const l = page().ladder!;
    b.run({ type: 'project/settings', settings: { numbering: { scheme: 'rung', pattern: NUMBERING_PRESETS.rung, start: 1, step: 1 } } });
    const y = l.top + 40; // rung 204
    b.wire(pg, [{ x: l.left, y }, { x: l.left + 30, y }]);
    b.wire(pg, [{ x: l.left + 40, y }, { x: l.left + 70, y }]);
    b.wire(pg, [{ x: l.left + 80, y }, { x: l.left + 110, y }]);
    b.wire(pg, [{ x: l.left + 40, y: y + 20 }, { x: l.left + 70, y: y + 20 }]);
    b.run({ type: 'wire/renumber' });
    const n = (x: number, yy: number) => wiresOf(page()).find((w) => w.points[0].x === x && w.points[0].y === yy)?.number;
    // The wire from the rail belongs to the 24 V rail, which starts on line 200; the next two are on 204.
    expect(n(l.left, y)).toBe(n(l.left, l.top));
    expect(n(l.left + 40, y)).toBe('204');
    expect(n(l.left + 80, y)).toBe('204A');
    expect(n(l.left + 40, y + 20)).toBe('206');
    expect(new Set(wiresOf(page()).map((w) => w.number)).size).toBe(wiresOf(page()).length - 1); // rail and its branch share one number
    expect(subLetter(1)).toBe('A');
    expect(subLetter(27)).toBe('AA');
  });
  it('a project with a ladder page is a valid file', () => {
    const { b } = make();
    expect(validateProject(JSON.parse(serializeProject(b.project)))).toEqual([]);
  });
});

describe('project history', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const service = (now: () => Date) => { const d = mkdtempSync(join(tmpdir(), 'cp-hist-')); dirs.push(d); return { h: new HistoryService(d, now), d }; };

  it('keeps one backup a day, the newest 30, and named versions newest first', () => {
    let day = new Date('2026-10-01T09:00:00Z');
    const { h } = service(() => day);
    expect(h.backup('p1', 'P', 'v1')).toEqual({ ok: true, value: true });
    expect(h.backup('p1', 'P', 'v2')).toEqual({ ok: true, value: false }); // same day
    for (let i = 1; i <= 35; i++) { day = new Date(Date.UTC(2026, 9, 1 + i, 9)); h.backup('p1', 'P', `d${i}`); }
    const list = h.list('p1');
    const daily = list.ok ? list.value.filter((e) => e.kind === 'daily') : [];
    expect(daily).toHaveLength(KEEP_DAILY);
    expect(daily[0].createdAt > daily[daily.length - 1].createdAt).toBe(true);
    const v = h.saveVersion('p1', '  Sent to the customer ', 'the text');
    expect(v.ok && v.value.name).toBe('Sent to the customer');
    const again = h.saveVersion('p1', 'Same minute', 'other');
    expect(again.ok && v.ok && again.value.id !== v.value.id).toBe(true);
    expect(v.ok && h.read('p1', v.value.id)).toEqual({ ok: true, value: 'the text' });
  });
  it('removes only named versions and refuses paths and names it cannot use', () => {
    const { h } = service(() => new Date('2026-10-26T10:00:00Z'));
    h.backup('p1', 'P', 'x');
    const v = h.saveVersion('p1', 'A', 'y');
    expect(h.saveVersion('p1', '   ', 'y').ok).toBe(false);
    expect(h.remove('p1', 'daily-2026-10-26.json').ok).toBe(false);
    expect(v.ok && h.remove('p1', v.value.id).ok).toBe(true);
    expect((h.list('p1') as { value: unknown[] }).value).toHaveLength(1);
    expect(h.read('p1', '../../etc/passwd').ok).toBe(false);
    expect(h.list('../x').ok).toBe(false);
    expect(h.list('never-saved')).toEqual({ ok: true, value: [] });
  });
  it('restoring a version replaces the project as one command', () => {
    const b = builder(lib, 't', 'T');
    const old = b.project;
    b.addPage('control', { en: 'Control' });
    const restored = apply(b.project, { type: 'project/replace', project: old }, { lib });
    expect(restored).toBe(old);
  });
});
