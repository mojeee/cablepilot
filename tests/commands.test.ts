// The command layer: every command applies and undoes, wires get junctions, moving a symbol drags
// the wires attached to it, rotate and mirror transform the pins.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '@shared/commands';
import { createHistory, exec, redo, undo } from '@shared/commands/history';
import { pinWorld } from '@shared/draw/symbol';
import type { SymbolEl } from '@shared/model/types';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const ctx = { lib };

function base() {
  const b = builder(lib, 'proj', 'Test');
  const pg = b.addPage('power', { en: 'Power' });
  return { b, pg };
}

describe('commands and undo', () => {
  it('undoes and redoes every command type back to the same project', () => {
    const { b, pg } = base();
    const k = b.place(pg, 'coil', 50, 50);
    const w = b.wire(pg, [{ x: 50, y: 20 }, { x: 50, y: 45 }]);
    const asset = { name: 'logo.png', mime: 'image/png' as const, data: 'AAAA', w: 10, h: 5 };
    const cmds: Command[] = [
      { type: 'project/set', name: 'Renamed', properties: { client: 'ACME' }, assembly: { ipDegree: 'IP54' } },
      { type: 'project/settings', settings: { drawingLanguage: 'it' } },
      { type: 'project/potentials', potentials: [{ id: 'X1', label: 'X1', kind: 'other' }] },
      { type: 'template/upsert', template: { ...b.project.templates[0], id: 'tpl2', name: 'Second' } },
      { type: 'asset/add', id: 'a1', asset },
      { type: 'symbol/embed', def: lib.symbols.get('fuse')! },
      { type: 'page/add', page: { id: 'px', type: 'control', title: { en: 'Control' }, size: 'A4', templateId: '', elements: [] } },
      { type: 'page/move', id: 'px', index: 0 },
      { type: 'page/update', id: pg, patch: { location: 'DS' } },
      { type: 'el/add', page: pg, elements: [{ id: 't1', kind: 'text', x: 10, y: 10, rot: 0, text: 'Hi', size: 3.5, align: 'left' }] },
      { type: 'el/update', page: pg, id: 't1', patch: { text: 'Changed' } },
      { type: 'el/move', page: pg, ids: [k.id], dx: 10, dy: 0 },
      { type: 'el/rotate', page: pg, ids: [k.id] },
      { type: 'el/mirror', page: pg, ids: [k.id] },
      { type: 'symbol/place', page: pg, element: { id: 'k2', kind: 'symbol', symbolId: 'coil', x: 100, y: 50, rot: 0, mirror: false, designation: '' }, autoNumber: true },
      { type: 'wire/add', page: pg, id: 'w2', points: [{ x: 80, y: 20 }, { x: 80, y: 40 }] },
      { type: 'designation/renumber' },
      { type: 'el/remove', page: pg, ids: [w, 't1'] },
      { type: 'page/remove', id: 'px' },
      { type: 'template/remove', id: 'tpl2' },
      { type: 'batch', label: 'two', commands: [{ type: 'project/set', name: 'A' }, { type: 'project/set', name: 'B' }] },
    ];
    let h = createHistory(b.project);
    const states = [h.present];
    for (const c of cmds) {
      h = exec(h, c, ctx);
      expect(h.present, c.type).not.toBe(states[states.length - 1]);
      states.push(h.present);
    }
    for (let i = cmds.length - 1; i >= 0; i--) {
      h = undo(h);
      expect(h.present, `undo ${cmds[i].type}`).toBe(states[i]);
    }
    for (let i = 0; i < cmds.length; i++) {
      h = redo(h);
      expect(h.present, `redo ${cmds[i].type}`).toBe(states[i + 1]);
    }
  });

  it('a command that changes nothing leaves no undo step', () => {
    const { b } = base();
    const h = exec(createHistory(b.project), { type: 'el/remove', page: 'nope', ids: [] }, ctx);
    expect(h.past).toHaveLength(0);
  });

  it('a new edit clears the redo stack', () => {
    const { b } = base();
    let h = exec(createHistory(b.project), { type: 'project/set', name: 'A' }, ctx);
    h = undo(h);
    h = exec(h, { type: 'project/set', name: 'B' }, ctx);
    expect(redo(h)).toBe(h);
  });
});

describe('wires', () => {
  it('drops duplicate and collinear points', () => {
    const { b, pg } = base();
    b.wire(pg, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]);
    const w = b.project.pages[0].elements[0];
    expect(w.kind === 'wire' && w.points).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]);
  });
  it('adds a junction where a branch ends on a wire, and none for an end-to-end join', () => {
    const { b, pg } = base();
    b.wire(pg, [{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    b.wire(pg, [{ x: 20, y: 0 }, { x: 20, y: 20 }]);
    expect(b.project.pages[0].elements.filter((e) => e.kind === 'junction')).toHaveLength(1);
    const c = base();
    c.b.wire(c.pg, [{ x: 0, y: 0 }, { x: 20, y: 0 }]);
    c.b.wire(c.pg, [{ x: 20, y: 0 }, { x: 20, y: 20 }]);
    expect(c.b.project.pages[0].elements.filter((e) => e.kind === 'junction')).toHaveLength(0);
  });
  it('removes the junction when its branch is deleted', () => {
    const { b, pg } = base();
    b.wire(pg, [{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    const branch = b.wire(pg, [{ x: 20, y: 0 }, { x: 20, y: 20 }]);
    const p = apply(b.project, { type: 'el/remove', page: pg, ids: [branch] }, ctx);
    expect(p.pages[0].elements.filter((e) => e.kind === 'junction')).toHaveLength(0);
  });
});

describe('moving, rotating and mirroring', () => {
  it('drags an attached wire end and keeps it orthogonal', () => {
    const { b, pg } = base();
    const k = b.place(pg, 'coil', 50, 50);
    const top = k.pin('A1');
    const w = b.wire(pg, [{ x: top.x, y: 20 }, top]);
    const p = apply(b.project, { type: 'el/move', page: pg, ids: [k.id], dx: 10, dy: 5 }, ctx);
    const wire = p.pages[0].elements.find((e) => e.id === w);
    expect(wire?.kind === 'wire' && wire.points[wire.points.length - 1]).toEqual({ x: 60, y: 50 });
    if (wire?.kind !== 'wire') throw new Error();
    for (let i = 0; i + 1 < wire.points.length; i++) expect(wire.points[i].x === wire.points[i + 1].x || wire.points[i].y === wire.points[i + 1].y).toBe(true);
  });
  it('rotates a symbol about its own anchor and its pins follow', () => {
    const { b, pg } = base();
    const k = b.place(pg, 'coil', 50, 50);
    const p = apply(b.project, { type: 'el/rotate', page: pg, ids: [k.id] }, ctx);
    const el = p.pages[0].elements[0] as SymbolEl;
    expect(el.rot).toBe(90);
    expect([el.x, el.y]).toEqual([50, 50]);
    const pins = pinWorld(lib.symbols.get('coil')!, el);
    expect(pins.find((q) => q.id === 'A1')).toMatchObject({ x: 55, y: 50, dir: 'right' });
  });
  it('mirrors a symbol and four rotations come back to the start', () => {
    const { b, pg } = base();
    const k = b.place(pg, 'motor-3ph', 50, 50);
    let p = b.project;
    for (let i = 0; i < 4; i++) p = apply(p, { type: 'el/rotate', page: pg, ids: [k.id] }, ctx);
    expect(p.pages[0].elements[0]).toEqual(b.project.pages[0].elements[0]);
    const m = apply(b.project, { type: 'el/mirror', page: pg, ids: [k.id] }, ctx).pages[0].elements[0] as SymbolEl;
    expect(m.mirror).toBe(true);
    expect(pinWorld(lib.symbols.get('motor-3ph')!, m).find((q) => q.id === 'U')?.x).toBe(55);
  });
});
