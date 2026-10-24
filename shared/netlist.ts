// A netlist for reports: every net group (nets joined across pages) with its pins in reading order,
// the wires and the wire numbers they carry. Built from the cached page nets (shared/connectivity),
// so a change on one page recomputes only that page's nets.

import { netGroups, projectNets, type NetGroup } from './connectivity';
import { keyOf } from './devices';
import type { Library } from './library/types';
import { withProjectSymbols } from './library/types';
import type { Page, Project, SymbolEl, BoxEl, WireEl } from './model/types';

export interface PinRef {
  page: string;
  pageIndex: number;
  el: string;
  pin: string;
  /** Full designation of the device, '' when the element has none. */
  device: string;
  /** Product designation as drawn ("-KM1"). */
  designation: string;
  /** What is printed: "-KM1:2", "-X1:5" for a terminal, a PLC address, "PE". Empty: not an endpoint. */
  label: string;
  fn: string;
  x: number;
  y: number;
}
export interface NetlistGroup {
  group: NetGroup;
  pins: PinRef[];
  wires: { page: string; id: string; number?: string; wire: WireEl }[];
  numbers: string[];
  potential?: string;
}
export interface Netlist {
  groups: NetlistGroup[];
  /** Group of a pin: keyed `${page}/${element}/${pin}`. */
  byPin: Map<string, NetlistGroup>;
}

/** Functions that are not endpoints of a conductor. */
const NOT_ENDPOINT = new Set(['potential-tag', 'interruption']);

function pinRef(project: Project, lib: Library, page: Page, pageIndex: number, el: SymbolEl | BoxEl, pin: string): PinRef {
  const def = el.kind === 'symbol' ? lib.symbols.get(el.symbolId) : undefined;
  const fn = el.kind === 'symbol' ? (def?.function ?? '') : el.variant;
  const device = el.designation ? keyOf(page, el.designation, el.location) : '';
  let label = '';
  if (NOT_ENDPOINT.has(fn)) label = '';
  else if (fn === 'earth-pe') label = 'PE';
  else if (el.kind === 'symbol' && fn === 'terminal' && el.designation) label = `${el.designation}:${el.value || pin}`;
  else if (el.designation) label = `${el.designation}:${pin}`;
  else if (el.kind === 'symbol' && el.value) label = el.value;
  return { page: page.id, pageIndex, el: el.id, pin, device, designation: el.designation, label, fn, x: el.x, y: el.y };
}

const memo = new WeakMap<Project, { lib: Library; nl: Netlist }>();

export function netlist(project: Project, libIn: Library): Netlist {
  const hit = memo.get(project);
  if (hit && hit.lib === libIn) return hit.nl;
  const lib = withProjectSymbols(libIn, project.symbols);
  const nets = projectNets(project, libIn);
  const byNet = new Map(nets.map((n) => [n.id, n]));
  const pageIdx = new Map(project.pages.map((p, i) => [p.id, i]));
  const els = new Map<string, SymbolEl | BoxEl>();
  const wireEl = new Map<string, WireEl>();
  for (const pg of project.pages) for (const e of pg.elements) {
    if (e.kind === 'symbol' || e.kind === 'box') els.set(`${pg.id}/${e.id}`, e);
    else if (e.kind === 'wire') wireEl.set(`${pg.id}/${e.id}`, e);
  }
  const groups: NetlistGroup[] = [];
  const byPin = new Map<string, NetlistGroup>();
  for (const g of netGroups(project, libIn, nets)) {
    const pins: PinRef[] = [];
    const wires: NetlistGroup['wires'] = [];
    for (const nid of g.nets) {
      const n = byNet.get(nid);
      if (!n) continue;
      const pi = pageIdx.get(n.page) ?? 0;
      for (const p of n.pins) {
        const el = els.get(`${n.page}/${p.element}`);
        if (el) pins.push(pinRef(project, lib, project.pages[pi], pi, el, p.pin));
      }
      for (const w of n.wires) {
        const we = wireEl.get(`${n.page}/${w}`);
        if (we) wires.push({ page: n.page, id: w, number: we.number, wire: we });
      }
    }
    pins.sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y || a.x - b.x || a.pin.localeCompare(b.pin, 'en', { numeric: true }));
    const numbers = [...new Set(wires.map((w) => w.number).filter((n): n is string => !!n))];
    const ng: NetlistGroup = { group: g, pins, wires, numbers, potential: g.potentials[0] };
    groups.push(ng);
    for (const p of pins) byPin.set(`${p.page}/${p.el}/${p.pin}`, ng);
  }
  const nl = { groups, byPin };
  memo.set(project, { lib: libIn, nl });
  return nl;
}

/** Endpoints of a group other than one pin: what that pin is connected to. */
export function destinations(g: NetlistGroup | undefined, self: { page: string; el: string; pin: string }): PinRef[] {
  if (!g) return [];
  return g.pins.filter((p) => p.label && !(p.page === self.page && p.el === self.el && p.pin === self.pin));
}
