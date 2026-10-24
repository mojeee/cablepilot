// Checks of the layout (M6 part 3): devices that overlap, that stick out of the plate, that sit in a no-mount
// zone, that are too deep for the enclosure, ducts over their fill limit and devices not placed yet. They are
// shown in the layout window; they are not part of the electrical rule check, which is about the schematic.

import { t } from '../i18n';
import type { Library } from '../library/types';
import type { Project } from '../model/types';
import { ductFills } from './fill';
import { boxOf, cabinetOf, inside, overlaps } from './model';
import { orphanDevices, unplacedDevices } from './place';
import { shortDesignation } from './draw';

export interface LayoutIssue {
  kind: 'overlap' | 'outside' | 'zone' | 'depth' | 'duct' | 'unplaced' | 'orphan';
  text: string;
  /** The layout element to select, when there is one. */
  element?: string;
  page?: string;
}

/** Whether the project has a layout worth checking: an enclosure or a placed device. */
export function layoutIssues(project: Project, lib: Library): LayoutIssue[] {
  const cab = cabinetOf(project);
  if (!cab.enclosure && cab.devices.length === 0) return [];
  const out: LayoutIssue[] = [];
  const name = (k?: string) => shortDesignation(k ?? '');
  const plateDevs = cab.devices.filter((p) => !cab.doors.includes(p.page));
  const frame = cab.plate ?? cab.enclosure;
  for (let i = 0; i < plateDevs.length; i++) {
    const a = plateDevs[i];
    if (frame && !inside(boxOf(a.el), boxOf(frame))) out.push({ kind: 'outside', text: t('{name} is outside the plate.', { name: name(a.el.designation) }), element: a.el.id, page: a.page.id });
    for (let j = i + 1; j < plateDevs.length; j++) if (overlaps(boxOf(a.el), boxOf(plateDevs[j].el))) out.push({ kind: 'overlap', text: t('{a} and {b} overlap.', { a: name(a.el.designation), b: name(plateDevs[j].el.designation) }), element: a.el.id, page: a.page.id });
    for (const z of cab.zones) if (overlaps(boxOf(a.el), boxOf(z.el))) out.push({ kind: 'zone', text: t('{name} is in a no-mount zone.', { name: name(a.el.designation) }), element: a.el.id, page: a.page.id });
    for (const d of cab.ducts) if (overlaps(boxOf(a.el), boxOf(d.el))) out.push({ kind: 'overlap', text: t('{a} and duct {b} overlap.', { a: name(a.el.designation), b: d.el.designation ?? '' }), element: a.el.id, page: a.page.id });
    if (cab.enclosure?.d !== undefined && (a.el.d ?? 0) + (cab.plate?.d ?? 0) > cab.enclosure.d) out.push({ kind: 'depth', text: t('{name} is deeper than the enclosure.', { name: name(a.el.designation) }), element: a.el.id, page: a.page.id });
  }
  const doorDevs = cab.devices.filter((p) => cab.doors.includes(p.page));
  if (cab.enclosure?.d !== undefined) {
    const deepest = Math.max(0, ...plateDevs.map((p) => p.el.d ?? 0));
    for (const p of doorDevs) {
      // Seen from the front, a door device above a plate device must clear it; a simple check on the depths.
      if (deepest + (p.el.d ?? 0) + (cab.plate?.d ?? 0) > cab.enclosure.d && plateDevs.some((q) => overlaps(boxOf(q.el), boxOf({ ...p.el, x: p.el.x - (cab.doorFrame?.x ?? 0) + cab.enclosure!.x, y: p.el.y - (cab.doorFrame?.y ?? 0) + cab.enclosure!.y }))))
        out.push({ kind: 'depth', text: t('{name} on the door collides with a device behind it.', { name: name(p.el.designation) }), element: p.el.id, page: p.page.id });
    }
  }
  for (const f of ductFills(project, lib)) if (f.over) out.push({ kind: 'duct', text: t('Duct {name} is {pct} % full (limit {max} %).', { name: f.label, pct: f.pct, max: f.max }), element: f.id, page: cab.front?.id });
  for (const d of unplacedDevices(project, lib, cab)) out.push({ kind: 'unplaced', text: t('{name} is not placed yet.', { name: name(d.key) }) });
  for (const k of orphanDevices(project, cab, lib)) out.push({ kind: 'orphan', text: t('{name} is on the layout but no longer in the schematic.', { name: name(k) }) });
  return out;
}
