// Layout templates (M6 part 3): a finished layout (enclosure, plate, rails, ducts, zones, covers and the
// standard device groups) saved to the company library and loaded into new projects. Devices in a template
// are slots: a part on a rail at a distance from the rail's start. Loading fills each slot with a device of
// the schematic that has that part (rule 1: the schematic decides which devices exist); the rest of the
// devices are placed by the suggestion around what the template put there. Pure.

import type { Command } from '../commands';
import { t } from '../i18n';
import { newId as defaultId } from '../ids';
import { findPart, type Library } from '../library/types';
import type { CabEl, CabItem, Project } from '../model/types';
import { cabinetOf, ENC_ORIGIN } from './model';
import { layoutPageCommands } from './pages';
import { unplacedDevices } from './place';
import { cabinetDevices } from './size';

export interface TemplateItem {
  item: CabItem;
  designation?: string;
  /** Millimetres from the plate's top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  d?: number;
  part?: string;
  note?: string;
}
export interface TemplateSlot {
  /** Label of the rail the device sits on and the distance from the rail's start. */
  rail: string;
  dx: number;
  /** The part id a device must have to fill the slot, and the body for the preview. */
  part: string;
  w: number;
  h: number;
  d: number;
}
export interface LayoutTemplate {
  id: string;
  kind: 'layout-template';
  title: { en: string; it: string };
  source: string;
  verification: 'primary' | 'secondary';
  verifiedFrom?: string;
  enclosure: { designation: string; w: number; h: number; d: number; part?: string };
  /** The plate: offset from the enclosure's top-left corner. */
  plate?: { x: number; y: number; w: number; h: number; d?: number; part?: string; designation?: string };
  items: TemplateItem[];
  slots: TemplateSlot[];
}

/** A template made from the project's current layout. */
export function templateFromLayout(project: Project, lib: Library, id: string, title: string): LayoutTemplate | null {
  const cab = cabinetOf(project);
  const enc = cab.enclosure;
  if (!enc) return null;
  const po = cab.plate ? { x: cab.plate.x, y: cab.plate.y } : { x: enc.x, y: enc.y };
  const items: TemplateItem[] = [...cab.rails, ...cab.ducts, ...cab.zones, ...cab.covers].map(({ el }) => ({ item: el.item, ...(el.designation ? { designation: el.designation } : {}), x: el.x - po.x, y: el.y - po.y, w: el.w, h: el.h, ...(el.d ? { d: el.d } : {}), ...(el.part ? { part: el.part } : {}), ...(el.note ? { note: el.note } : {}) }));
  const byKey = new Map(cabinetDevices(project, lib).map((d) => [d.key, d]));
  const slots: TemplateSlot[] = [];
  for (const { el } of cab.devices) {
    const rail = cab.rails.find((r) => r.el.id === el.rail)?.el;
    const part = byKey.get(el.designation as string)?.part;
    if (rail?.designation && part) slots.push({ rail: rail.designation, dx: el.x - rail.x, part: part.id, w: el.w, h: el.h, d: el.d ?? part.dimensions?.d ?? 60 });
  }
  return {
    id, kind: 'layout-template', title: { en: title, it: title },
    source: 'Made from a project layout in CablePilot (company layout template)', verification: 'secondary', verifiedFrom: 'Company-made; the enclosure and part dimensions come from the parts used',
    enclosure: { designation: enc.designation ?? 'A1', w: enc.w, h: enc.h, d: enc.d ?? 0, ...(enc.part ? { part: enc.part } : {}) },
    ...(cab.plate ? { plate: { x: cab.plate.x - enc.x, y: cab.plate.y - enc.y, w: cab.plate.w, h: cab.plate.h, d: cab.plate.d, ...(cab.plate.part ? { part: cab.plate.part } : {}), ...(cab.plate.designation ? { designation: cab.plate.designation } : {}) } } : {}),
    items, slots,
  };
}

export interface TemplateLoad {
  commands: Command[];
  warnings: string[];
  /** Devices that took a slot. */
  filled: number;
  /** Slots left empty (no unplaced device with that part). */
  empty: number;
  page: string;
}

/** Commands that put a template's layout into a project that has none: pages, enclosure, plate, rails, ducts, zones, covers and the filled slots. */
export function loadTemplate(project: Project, lib: Library, tpl: LayoutTemplate, newId: (prefix?: string) => string = defaultId): TemplateLoad {
  const cab = cabinetOf(project);
  const out: TemplateLoad = { commands: [], warnings: [], filled: 0, empty: 0, page: cab.front?.id ?? '' };
  if (cab.enclosure) { out.warnings.push(t('This project already has a cabinet layout. Load a template into a new project, or delete the layout first.')); return out; }
  const pages = layoutPageCommands(project, tpl.enclosure, false);
  out.commands.push(...pages.cmds);
  out.page = pages.ids.front;
  const enc: CabEl = { id: newId('c'), kind: 'cab', item: 'enclosure', x: ENC_ORIGIN.x, y: ENC_ORIGIN.y, w: tpl.enclosure.w, h: tpl.enclosure.h, d: tpl.enclosure.d, designation: tpl.enclosure.designation, ...(tpl.enclosure.part ? { part: tpl.enclosure.part } : {}) };
  const add: CabEl[] = [enc];
  const pl = tpl.plate;
  const po = pl ? { x: enc.x + pl.x, y: enc.y + pl.y } : { x: enc.x, y: enc.y };
  if (pl) add.push({ id: newId('c'), kind: 'cab', item: 'plate', x: po.x, y: po.y, w: pl.w, h: pl.h, ...(pl.d ? { d: pl.d } : {}), designation: pl.designation ?? 'MP1', ...(pl.part ? { part: pl.part } : {}) });
  const rails = new Map<string, CabEl>();
  for (const it of tpl.items) {
    const el: CabEl = { id: newId('c'), kind: 'cab', item: it.item, x: po.x + it.x, y: po.y + it.y, w: it.w, h: it.h, ...(it.d ? { d: it.d } : {}), ...(it.designation ? { designation: it.designation } : {}), ...(it.part ? { part: it.part } : {}), ...(it.note ? { note: it.note } : {}) };
    add.push(el);
    if (it.item === 'rail' && it.designation) rails.set(it.designation, el);
  }
  // Slots: the first unplaced device with the part takes the place.
  const free = unplacedDevices(project, lib).filter((d) => d.mount === 'rail');
  for (const s of tpl.slots) {
    const rail = rails.get(s.rail);
    const i = free.findIndex((d) => d.part?.id === s.part);
    if (!rail || i < 0) { out.empty++; continue; }
    const [d] = free.splice(i, 1);
    add.push({ id: newId('c'), kind: 'cab', item: 'device', x: rail.x + s.dx, y: rail.y + rail.h / 2 - d.h / 2, w: d.w, h: d.h, d: d.d, designation: d.key, rail: rail.id });
    out.filled++;
  }
  out.commands.push({ type: 'el/add', page: pages.ids.front, elements: add });
  return out;
}

/** Whether data read from a company library file is a layout template with the fields loading needs. */
export function isTemplate(d: unknown): d is LayoutTemplate {
  const o = d as LayoutTemplate | null;
  return !!o && o.kind === 'layout-template' && !!o.enclosure && [o.enclosure.w, o.enclosure.h, o.enclosure.d].every((n) => typeof n === 'number' && n > 0) && Array.isArray(o.items) && Array.isArray(o.slots);
}
export const partOfSlot = (project: Project, lib: Library, s: TemplateSlot) => findPart(lib, project.parts, s.part);
