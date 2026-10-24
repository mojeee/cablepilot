// Duct fill rate (M6 part 3): the cross-section of every wire routed through a duct (from its outer
// diameter, shared/cabinet/size.ts WIRE_DIAMETER, unverified: docs/to-verify.md) over the duct's inner
// section, compared with the company limit (project settings, default 50 %). A planning estimate: it
// does not replace the duct manufacturer's data or the installer's check.

import type { Library } from '../library/types';
import type { Project } from '../model/types';
import { connections, coreSpec } from '../reports';
import { numOf } from '../sizing';
import { wireSpec } from '../wires';
import { routerOf } from './route';
import { wireDiameter } from './size';

export interface DuctFill {
  /** The duct element's id and its label ("D1"). */
  id: string;
  label: string;
  /** Inner section in square millimetres (width times depth). */
  innerMm2: number;
  usedMm2: number;
  wires: number;
  pct: number;
  max: number;
  over: boolean;
}

/** The fill rate of every duct of the layout (empty when no wire runs through a duct). */
export function ductFills(project: Project, lib: Library): DuctFill[] {
  const r = routerOf(project);
  if (!r) return [];
  const max = project.settings.layout.ductFillMax;
  const used = new Map<string, { mm2: number; n: number }>();
  for (const c of connections(project, lib)) {
    const a = c.group.pins.find((p) => p.label && p.label === c.from)?.device, b = c.group.pins.find((p) => p.label && p.label === c.to)?.device;
    if (!a || !b) continue;
    const rt = r.route(a, b);
    if (!rt) continue;
    const w = c.wire?.wire;
    const spec = wireSpec(project, { wireType: w?.wireType, potential: w?.potential }, c.group.potential);
    const xs = numOf((w ? coreSpec(project, lib, w).crossSection : undefined) ?? spec.crossSection);
    const d = wireDiameter(xs);
    for (const id of rt.ducts) {
      const u = used.get(id) ?? used.set(id, { mm2: 0, n: 0 }).get(id)!;
      u.mm2 += (Math.PI * d * d) / 4;
      u.n++;
    }
  }
  const out: DuctFill[] = [];
  for (const [id, p] of r.ducts) {
    const e = p.el;
    const inner = Math.min(e.w, e.h) * (e.d ?? Math.min(e.w, e.h));
    const u = used.get(id) ?? { mm2: 0, n: 0 };
    const pct = inner > 0 ? (u.mm2 / inner) * 100 : 0;
    out.push({ id, label: e.designation ?? id, innerMm2: inner, usedMm2: Math.round(u.mm2), wires: u.n, pct: Math.round(pct * 10) / 10, max, over: pct > max });
  }
  return out;
}
