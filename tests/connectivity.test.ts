import { describe, expect, it } from 'vitest';
import { pageNets, projectNets } from '@shared/connectivity';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();

describe('connectivity', () => {
  it('joins wires that meet end to end or in a T, but not wires that only cross', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('power', { en: 'P' });
    b.wire(pg, [{ x: 0, y: 0 }, { x: 20, y: 0 }]);
    b.wire(pg, [{ x: 20, y: 0 }, { x: 20, y: 20 }]);
    b.wire(pg, [{ x: 10, y: 0 }, { x: 10, y: -20 }]); // T on the first wire
    b.wire(pg, [{ x: 0, y: 50 }, { x: 40, y: 50 }]);
    b.wire(pg, [{ x: 20, y: 40 }, { x: 20, y: 60 }]); // crosses the fourth wire: not connected
    const nets = pageNets(b.project, b.project.pages[0], lib);
    expect(nets.map((n) => n.wires.length).sort()).toEqual([1, 1, 3]);
  });
  it('a junction connects crossing wires', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('power', { en: 'P' });
    b.wire(pg, [{ x: 0, y: 50 }, { x: 40, y: 50 }]);
    b.wire(pg, [{ x: 20, y: 40 }, { x: 20, y: 60 }]);
    b.run({ type: 'el/add', page: pg, elements: [{ id: 'j', kind: 'junction', x: 20, y: 50 }] });
    expect(pageNets(b.project, b.project.pages[0], lib)).toHaveLength(1);
  });
  it('connects pins through wires and lists them in the net', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('control', { en: 'C' });
    const s = b.place(pg, 'pushbutton-no', 50, 50);
    const k = b.place(pg, 'coil', 50, 80);
    b.wire(pg, [s.pin('4'), k.pin('A1')]);
    const nets = pageNets(b.project, b.project.pages[0], lib);
    expect(nets).toHaveLength(1);
    expect(nets[0].pins.map((p) => p.pin).sort()).toEqual(['4', 'A1']);
  });
  it('symbols whose pins touch are connected without a wire', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('control', { en: 'C' });
    b.place(pg, 'fuse', 50, 50);
    b.place(pg, 'coil', 50, 60);
    expect(pageNets(b.project, b.project.pages[0], lib)).toHaveLength(1);
  });
  it('takes the potential from a wire or a potential tag, and reports a conflict', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('power', { en: 'P' });
    const tag = b.place(pg, 'potential-tag', 10, 50, { value: 'L1' });
    b.wire(pg, [tag.pin('1'), { x: 40, y: 50 }]);
    let nets = pageNets(b.project, b.project.pages[0], lib);
    expect(nets[0]).toMatchObject({ potential: 'L1', conflict: false });
    b.wire(pg, [{ x: 40, y: 50 }, { x: 40, y: 70 }], { potential: 'L2' });
    nets = pageNets(b.project, b.project.pages[0], lib);
    expect(nets[0].conflict).toBe(true);
    expect(nets[0].potentials.sort()).toEqual(['L1', 'L2']);
    expect(nets[0].potential).toBeUndefined();
  });
  it('gives stable net ids and keeps pages apart', () => {
    const b = builder(lib, 'p', 'T');
    const a = b.addPage('power', { en: 'A' });
    const c = b.addPage('power', { en: 'B' });
    b.wire(a, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    b.wire(c, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    const ids = projectNets(b.project, lib).map((n) => n.id);
    expect(ids).toEqual([`${a}:1`, `${c}:1`]);
    expect(projectNets(b.project, lib).map((n) => n.id)).toEqual(ids);
  });
});
