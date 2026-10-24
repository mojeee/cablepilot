// Connectivity: nets and potentials computed from the model (rule 1: the schematic is the source
// of truth). Within a page, wires connect where one wire's end meets another wire (a T), where a
// junction sits, and to a symbol pin that lies on the wire. Wires that merely cross are not
// connected. Nets are computed per page; interruption points (same signal name) and mated
// connectors (same pin number) join nets across pages in netGroups.

import { branchesAt, pointOnPolyline, samePt } from './geometry/wires';
import type { Library } from './library/types';
import { withProjectSymbols } from './library/types';
import { boxPinsWorld } from './draw/box';
import { pinWorld } from './draw/symbol';
import type { JunctionEl, Page, Project, WireEl } from './model/types';

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
  /** Distinct potentials set on wires, by potential tags or by interruption points in this net. */
  potentials: string[];
  /** Signal names of interruption points in this net: they join the net to nets on other pages. */
  signals: string[];
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

const netCache = new WeakMap<Page, { potentials: unknown; symbols: unknown; lib: Library; nets: Net[] }>();
/** Counts page net computations: tests use it to check that edits recompute only the pages that changed. */
export const netStats = { pages: 0 };

/** The nets of a page; cached while the page object, the potentials, the symbols and the library are unchanged. */
export function pageNets(project: Project, page: Page, libIn: Library): Net[] {
  const hit = netCache.get(page);
  if (hit && hit.potentials === project.potentials && hit.symbols === project.symbols && hit.lib === libIn) return hit.nets;
  netStats.pages++;
  const nets = computePageNets(project, page, libIn);
  netCache.set(page, { potentials: project.potentials, symbols: project.symbols, lib: libIn, nets });
  return nets;
}

function computePageNets(project: Project, page: Page, libIn: Library): Net[] {
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
  const pinNodes: { el: string; fn: string; value?: string; pin: string; x: number; y: number; node: number }[] = [];
  const addPins = (el: string, fn: string, value: string | undefined, pins: { id: string; x: number; y: number }[]) => {
    for (const pw of pins) {
      const node = dsu.add();
      pinNodes.push({ el, fn, value, pin: pw.id, x: pw.x, y: pw.y, node });
      wires.forEach((w, i) => {
        if (pointOnPolyline(pw, w.points)) dsu.union(node, wireNode[i]);
      });
    }
  };
  for (const el of page.elements) {
    if (el.kind === 'symbol') {
      const def = lib.symbols.get(el.symbolId);
      if (def) addPins(el.id, def.function, el.value, pinWorld(def, el));
    } else if (el.kind === 'box') addPins(el.id, el.variant, undefined, boxPinsWorld(el));
  }
  for (let i = 0; i < pinNodes.length; i++) for (let j = i + 1; j < pinNodes.length; j++) if (samePt(pinNodes[i], pinNodes[j])) dsu.union(pinNodes[i].node, pinNodes[j].node);

  // Collect nets, in order of first appearance (wires, then pins) so ids are stable.
  const nets = new Map<number, Net>();
  const order: number[] = [];
  const get = (node: number): Net => {
    const r = dsu.find(node);
    let n = nets.get(r);
    if (!n) {
      n = { id: '', page: page.id, wires: [], pins: [], potentials: [], signals: [], conflict: false };
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
    n.pins.push({ element: pn.el, pin: pn.pin });
    if (pn.fn === 'potential-tag' && pn.value && !n.potentials.includes(pn.value)) n.potentials.push(pn.value);
    if (pn.fn === 'interruption' && pn.value) {
      if (!n.signals.includes(pn.value)) n.signals.push(pn.value);
      // A signal named like a project potential carries that potential.
      if (project.potentials.some((p) => p.id === pn.value) && !n.potentials.includes(pn.value)) n.potentials.push(pn.value);
    }
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

/** Nets joined across pages: by interruption points of the same signal, and by mated connector pins. */
export interface NetGroup {
  id: string;
  nets: string[];
  pages: string[];
  signals: string[];
  potentials: string[];
  conflict: boolean;
}

export function netGroups(project: Project, libIn: Library, nets: Net[] = projectNets(project, libIn)): NetGroup[] {
  const dsu = new Dsu();
  const node = new Map<string, number>(nets.map((n) => [n.id, dsu.add()]));
  const bySignal = new Map<string, string>();
  for (const n of nets) {
    for (const sg of n.signals) {
      const first = bySignal.get(sg);
      if (first) dsu.union(node.get(first) as number, node.get(n.id) as number);
      else bySignal.set(sg, n.id);
    }
  }
  // Mated connectors: boxes whose `mate` names another box's designation join pins with the same number.
  const boxes = project.pages.flatMap((pg) => pg.elements.filter((e) => e.kind === 'box').map((e) => ({ pg, e })));
  const pinNet = new Map<string, string>();
  for (const n of nets) for (const p of n.pins) pinNet.set(`${n.page}/${p.element}/${p.pin}`, n.id);
  for (const { pg, e } of boxes) {
    if (e.kind !== 'box' || !e.mate) continue;
    const other = boxes.find((o) => o.e.kind === 'box' && o.e.designation === e.mate && o.e !== e);
    if (!other || other.e.kind !== 'box') continue;
    for (const p of e.pins) {
      const a = pinNet.get(`${pg.id}/${e.id}/${p.id}`), b = pinNet.get(`${other.pg.id}/${other.e.id}/${p.id}`);
      if (a && b) dsu.union(node.get(a) as number, node.get(b) as number);
    }
  }
  const groups = new Map<number, NetGroup>();
  for (const n of nets) {
    const r = dsu.find(node.get(n.id) as number);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = { id: n.id, nets: [], pages: [], signals: [], potentials: [], conflict: false }));
    g.nets.push(n.id);
    if (!g.pages.includes(n.page)) g.pages.push(n.page);
    for (const s of n.signals) if (!g.signals.includes(s)) g.signals.push(s);
    for (const p of n.potentials) if (!g.potentials.includes(p)) g.potentials.push(p);
  }
  for (const g of groups.values()) g.conflict = g.potentials.length > 1;
  return [...groups.values()];
}
