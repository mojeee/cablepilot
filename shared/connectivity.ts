// Connectivity: nets and potentials computed from the model (rule 1: the schematic is the source
// of truth). Within a page, wires connect where one wire's end meets another wire (a T), where a
// junction sits, and to a symbol pin that lies on the wire. Wires that merely cross are not
// connected. Nets are computed per page; interruption points that join pages arrive in M2.

import { branchesAt, pointOnPolyline, samePt } from './geometry/wires';
import type { Library } from './library/types';
import { withProjectSymbols } from './library/types';
import { pinWorld } from './draw/symbol';
import type { JunctionEl, Page, Project, SymbolEl, WireEl } from './model/types';

export interface NetPin {
  element: string;
  pin: string;
}
export interface Net {
  /** Stable id: page id and the order of the net's first element. */
  id: string;
  page: string;
  wires: string[];
  pins: NetPin[];
  /** Distinct potentials set on wires or by potential tags in this net. */
  potentials: string[];
  /** The net's potential when exactly one is set. */
  potential?: string;
  /** True when two or more different potentials are tied together (rule 5, checked in M4). */
  conflict: boolean;
}

class Dsu {
  p: number[] = [];
  add(): number {
    this.p.push(this.p.length);
    return this.p.length - 1;
  }
  find(x: number): number {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    this.p[this.find(a)] = this.find(b);
  }
}

export function pageNets(project: Project, page: Page, libIn: Library): Net[] {
  const lib = withProjectSymbols(libIn, project.symbols);
  const dsu = new Dsu();
  const wires = page.elements.filter((e): e is WireEl => e.kind === 'wire');
  const junctions = page.elements.filter((e): e is JunctionEl => e.kind === 'junction');
  const wireNode = wires.map(() => dsu.add());

  // Wire ↔ wire: an end of one lies on the other.
  for (let i = 0; i < wires.length; i++) {
    const a = wires[i];
    for (let j = i + 1; j < wires.length; j++) {
      const b = wires[j];
      const ends = [a.points[0], a.points[a.points.length - 1]];
      const bends = [b.points[0], b.points[b.points.length - 1]];
      if (ends.some((e) => pointOnPolyline(e, b.points)) || bends.some((e) => pointOnPolyline(e, a.points))) dsu.union(wireNode[i], wireNode[j]);
    }
  }
  // Junctions connect every wire through their point.
  for (const jn of junctions) {
    const p = { x: jn.x, y: jn.y };
    let first = -1;
    wires.forEach((w, i) => {
      if (branchesAt(p, w.points) > 0) {
        if (first < 0) first = i;
        else dsu.union(wireNode[first], wireNode[i]);
      }
    });
  }
  // Pins: a pin on a wire joins it; pins at the same point join each other.
  const pinNodes: { el: SymbolEl; pin: string; x: number; y: number; node: number }[] = [];
  for (const el of page.elements) {
    if (el.kind !== 'symbol') continue;
    const def = lib.symbols.get(el.symbolId);
    if (!def) continue;
    for (const pw of pinWorld(def, el)) {
      const node = dsu.add();
      pinNodes.push({ el, pin: pw.id, x: pw.x, y: pw.y, node });
      wires.forEach((w, i) => {
        if (pointOnPolyline(pw, w.points)) dsu.union(node, wireNode[i]);
      });
    }
  }
  for (let i = 0; i < pinNodes.length; i++) for (let j = i + 1; j < pinNodes.length; j++) if (samePt(pinNodes[i], pinNodes[j])) dsu.union(pinNodes[i].node, pinNodes[j].node);

  // Collect nets, in order of first appearance (wires, then pins) so ids are stable.
  const nets = new Map<number, Net>();
  const order: number[] = [];
  const get = (node: number): Net => {
    const r = dsu.find(node);
    let n = nets.get(r);
    if (!n) {
      n = { id: '', page: page.id, wires: [], pins: [], potentials: [], conflict: false };
      nets.set(r, n);
      order.push(r);
    }
    return n;
  };
  wires.forEach((w, i) => {
    const n = get(wireNode[i]);
    n.wires.push(w.id);
    if (w.potential && !n.potentials.includes(w.potential)) n.potentials.push(w.potential);
  });
  for (const pn of pinNodes) {
    const n = get(pn.node);
    n.pins.push({ element: pn.el.id, pin: pn.pin });
    if (lib.symbols.get(pn.el.symbolId)?.function === 'potential-tag' && pn.el.value && !n.potentials.includes(pn.el.value)) n.potentials.push(pn.el.value);
  }
  // A pin alone (no wire, no other pin) is not a net.
  const result: Net[] = [];
  order.forEach((r) => {
    const n = nets.get(r) as Net;
    if (n.wires.length === 0 && n.pins.length < 2) return;
    n.id = `${page.id}:${result.length + 1}`;
    n.conflict = n.potentials.length > 1;
    if (n.potentials.length === 1) n.potential = n.potentials[0];
    result.push(n);
  });
  return result;
}

export function projectNets(project: Project, lib: Library): Net[] {
  return project.pages.flatMap((pg) => pageNets(project, pg, lib));
}
