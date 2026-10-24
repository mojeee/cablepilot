// The cabinet layout commands of the CAD workspace (M6 part 3): drawing an enclosure, plate, rail, duct,
// no-mount zone, cover and dimension line, placing devices from the BOM, aligning and distributing, and the
// windows. They are sessions like LINE and RECTANGLE (snaps, typed coordinates, command line) and every
// edit goes through the editor's command layer.

import { t } from '@shared/i18n';
import { newId } from '@shared/ids';
import { dist } from '@shared/cad/geom';
import { parseNumber } from '@shared/cad/input';
import { cabinetOf, isCab, isLayoutPage } from '@shared/cabinet/model';
import { layoutPageCommands } from '@shared/cabinet/pages';
import { alignCommands, distributeCommands, makeDevice, snapToRail, unplacedDevices, type AlignMode, ALIGN_MODES } from '@shared/cabinet/place';
import { shortDesignation } from '@shared/cabinet/draw';
import type { Command } from '@shared/commands';
import type { CabEl, CabItem, Page, Pt } from '@shared/model/types';
import { findPart, type PartDef } from '@shared/library/types';
import { useCad, type Session } from '../state/cad';
import { useEditor } from '../state/editor';
import { useLayout } from '../state/layout';

const ed = () => useEditor.getState();
const cad = () => useCad.getState();
const say = (text: string) => cad().say('info', text);
const bad = (text: string) => cad().say('error', text);
const end = (): void => { cad().go(null); cad().setTyping(''); };
const go = (s: Session): void => cad().go(s);
const noText = () => false;
const base = (name: string, prompt: string, extra: Partial<Session> = {}): Session => ({ name, prompt, base: null, pick: 'point', point: () => undefined, text: noText, enter: end, ...extra });
const box = (x: number, y: number, w: number, h: number): Pt[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

/** The layout page the user is on, or an explanation of what to do. `view`: which kind of page the command needs. */
function layoutPage(view: 'front' | 'door' | 'any' = 'front'): Page | null {
  const pg = ed().page();
  if (pg && isLayoutPage(pg) && pg.layout.view !== 'side' && (view === 'any' || pg.layout.view === view)) return pg;
  bad(view === 'door' ? t('Open a door page first (a layout page of the door).') : t('Open a layout page first: use Add layout pages in the Layout tab, or Suggest layout.'));
  return null;
}

const nextLabel = (pg: Page, item: CabItem, prefix: string): string => {
  const used = new Set(pg.elements.filter(isCab).filter((e) => e.item === item).map((e) => e.designation));
  for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
};
const add = (pg: Page, el: CabEl, extra: Command[] = []): void => {
  ed().exec({ type: 'batch', label: 'layout', commands: [...extra, { type: 'el/add', page: pg.id, elements: [el] }] });
  ed().select([el.id]);
};

const partsOf = (pred: (p: PartDef) => boolean): PartDef[] => {
  const lib = ed().lib;
  const m = new Map<string, PartDef>(lib.parts);
  for (const p of ed().project().parts) m.set(p.id, p);
  return [...m.values()].filter(pred);
};
export const railPart = (): PartDef | undefined => partsOf((p) => p.id.startsWith('generic-din-rail'))[0];
export const ductParts = (): PartDef[] => partsOf((p) => p.id.startsWith('generic-cable-duct') && !!p.dimensions).sort((a, b) => (a.dimensions?.h ?? 0) - (b.dimensions?.h ?? 0));
export const enclosureParts = (): PartDef[] => partsOf((p) => p.category === 'enclosures' && (p.dimensions?.d ?? 0) > 10);
export const plateParts = (): PartDef[] => partsOf((p) => p.category === 'enclosures' && !!p.dimensions && p.dimensions.d <= 10);

/** A rectangle item drawn by two corners: no-mount zone, cover, or a plain plate. */
export function rectItemSession(item: 'zone' | 'cover' | 'plate', first: Pt | null = null): Session {
  const name = item === 'zone' ? 'ZONE' : item === 'cover' ? 'COVER' : 'PLATE';
  return base(name, first ? t('Specify other corner:') : t('Specify first corner:'), {
    base: first,
    rubber: (c) => (first ? [{ kind: 'poly', pts: box(Math.min(first.x, c.x), Math.min(first.y, c.y), Math.abs(c.x - first.x), Math.abs(c.y - first.y)), closed: true }] : []),
    point(p) {
      if (!first) return go(rectItemSession(item, p));
      const pg = layoutPage();
      if (!pg || Math.abs(p.x - first.x) < 1e-6 || Math.abs(p.y - first.y) < 1e-6) return bad(t('The rectangle has no area.'));
      add(pg, { id: newId('c'), kind: 'cab', item, x: Math.min(p.x, first.x), y: Math.min(p.y, first.y), w: Math.abs(p.x - first.x), h: Math.abs(p.y - first.y), ...(item === 'plate' ? { designation: nextLabel(pg, 'plate', 'MP'), d: 3 } : {}) });
      end();
    },
  });
}

/** A DIN rail or a wire duct drawn by its two end points. The rail is 35 mm wide; the duct takes its width and depth from the part. */
export function lineItemSession(item: 'rail' | 'duct', partId?: string, first: Pt | null = null): Session {
  const part = partId ? partsOf((p) => p.id === partId)[0] : item === 'rail' ? railPart() : ductParts()[0];
  const thick = item === 'rail' ? 35 : (part?.dimensions?.h ?? 60);
  const geo = (a: Pt, b: Pt) => {
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    return horizontal ? { x: Math.min(a.x, b.x), y: a.y - thick / 2, w: Math.abs(b.x - a.x), h: thick } : { x: a.x - thick / 2, y: Math.min(a.y, b.y), w: thick, h: Math.abs(b.y - a.y) };
  };
  return sessionOf(item, first, partId, geo, thick);
}
function sessionOf(item: 'rail' | 'duct', first: Pt | null, partId: string | undefined, geo: (a: Pt, b: Pt) => { x: number; y: number; w: number; h: number }, _thick: number): Session {
  const part = partId ? partsOf((p) => p.id === partId)[0] : item === 'rail' ? railPart() : ductParts()[0];
  return base(item === 'rail' ? 'RAIL' : 'DUCT', first ? t('Specify the other end (the centre line):') : t('Specify the first end (the centre line):'), {
    base: first,
    rubber: (c) => (first ? [{ kind: 'poly', pts: (() => { const g = geo(first, c); return box(g.x, g.y, g.w, g.h); })(), closed: true }] : []),
    point: (p) => finish(p),
    // A typed length continues from the first end to the right.
    text(s) {
      const n = parseNumber(s);
      if (!first || n === null || n <= 0) return false;
      finish({ x: first.x + n, y: first.y });
      return true;
    },
  });
  function finish(p: Pt): void {
    if (!first) return go(lineItemSession(item, partId, p));
    const pg = layoutPage();
    if (!pg || dist(first, p) < 1e-6) return bad(t('The length must be larger than zero.'));
    add(pg, { id: newId('c'), kind: 'cab', item, ...geo(first, p), designation: nextLabel(pg, item, item === 'rail' ? 'R' : 'D'), ...(part ? { part: part.id } : {}), ...(item === 'duct' ? { d: part?.dimensions?.d ?? 60 } : {}) });
    end();
  }
}

/** A dimension line: the two measured points, then a point on the side the line goes to. */
export function dimSession(a: Pt | null = null, b: Pt | null = null): Session {
  const off = (c: Pt): number => { const len = Math.hypot(b!.x - a!.x, b!.y - a!.y) || 1; return Math.round(((c.x - a!.x) * -(b!.y - a!.y) + (c.y - a!.y) * (b!.x - a!.x)) / len); };
  return base('DIM', !a ? t('Specify the first point to measure:') : !b ? t('Specify the second point to measure:') : t('Specify where the dimension line goes:'), {
    base: b ?? a,
    rubber: (c) => (a && !b ? [{ kind: 'poly', pts: [a, c] }] : a && b ? [{ kind: 'poly', pts: [a, b] }, { kind: 'poly', pts: (() => { const d = off(c); const len = Math.hypot(b.x - a.x, b.y - a.y) || 1; const n = { x: (-(b.y - a.y) / len) * d, y: ((b.x - a.x) / len) * d }; return [{ x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }]; })() }] : []),
    point(p) {
      if (!a) return go(dimSession(p));
      if (!b) return dist(a, p) < 1e-6 ? bad(t('The two points are the same.')) : go(dimSession(a, p));
      const pg = layoutPage();
      if (!pg) return;
      add(pg, { id: newId('c'), kind: 'cab', item: 'dim', x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, d: off(p) });
      go(dimSession());
    },
  });
}

/** Places an enclosure or a plate from a library part. The first enclosure also adds the side view page; a plate goes to the middle of the enclosure. */
export function placeFramePart(partId: string): void {
  const part = partsOf((p) => p.id === partId)[0];
  const d = part?.dimensions;
  if (!part || !d) return bad(t('That part has no dimensions.'));
  const pg = layoutPage();
  if (!pg) return;
  const cab = cabinetOf(ed().project());
  const plate = d.d <= 10;
  if (plate && cab.enclosure) {
    const e = cab.enclosure;
    const el: CabEl = { id: newId('c'), kind: 'cab', item: 'plate', x: e.x + (e.w - d.w) / 2, y: e.y + (e.h - d.h) / 2, w: d.w, h: d.h, d: d.d, designation: 'MP1', part: part.id };
    const old = cab.plate;
    ed().exec({ type: 'batch', label: 'layout', commands: [...(old ? [{ type: 'el/remove' as const, page: pg.id, ids: [old.id] }] : []), { type: 'el/add', page: pg.id, elements: [el] }] });
    ed().select([el.id]);
    return say(t('Plate {code} placed in the middle of the enclosure.', { code: part.code }));
  }
  go(base(plate ? 'PLATE' : 'ENCLOSURE', t('Specify the top-left corner of the {what}:', { what: plate ? t('plate') : t('enclosure') }), {
    rubber: (c) => [{ kind: 'poly', pts: box(c.x, c.y, d.w, d.h), closed: true }],
    point(p) {
      const el: CabEl = { id: newId('c'), kind: 'cab', item: plate ? 'plate' : 'enclosure', x: p.x, y: p.y, w: d.w, h: d.h, d: d.d, designation: plate ? 'MP1' : 'A1', part: part.id };
      const pages = plate ? [] : layoutPageCommands(ed().project(), d, false).cmds.filter((c) => c.type !== 'page/add' || c.page.id !== pg.id);
      add(pg, el, pages.filter((c) => c.type === 'page/add' || c.type === 'page/update'));
      end();
    },
  }));
}

/** Starts placing devices of the schematic one after the other on the plate (or the door); Esc stops. */
export function placeDevices(keys: string[]): void {
  const project = ed().project();
  const todo = unplacedDevices(project, ed().lib);
  const list = keys.length ? keys : todo.map((d) => d.key);
  const key = list.find((k) => todo.some((d) => d.key === k));
  if (!key) return say(t('Every device of the schematic is placed.'));
  const cd = todo.find((d) => d.key === key)!;
  const rest = list.filter((k) => k !== key);
  const door = cd.mount === 'door';
  let pg = layoutPage(door ? 'door' : 'front');
  if (!pg && door) {
    // A door device needs a door page: make it, and go there.
    const cab = cabinetOf(project);
    if (!cab.enclosure) return;
    const cmds = layoutPageCommands(project, cab.enclosure, true);
    if (cmds.cmds.length) ed().exec({ type: 'batch', label: 'layout', commands: cmds.cmds });
    const doorPage = ed().project().pages.find((p) => p.id === cmds.ids.door);
    if (!doorPage) return;
    if (!doorPage.elements.some((e) => isCab(e) && e.item === 'enclosure')) ed().exec({ type: 'el/add', page: doorPage.id, elements: [{ ...cab.enclosure, id: newId('c'), auto: undefined }] });
    ed().patch({ pageId: doorPage.id, selection: [] });
    pg = ed().page() ?? null;
  }
  if (!pg) return;
  const pageId = pg.id;
  const name = shortDesignation(key);
  go(base('PLACE', t('Specify the position of {name} (top-left corner), Esc to stop:', { name }), {
    rubber: (c) => [{ kind: 'poly', pts: box(c.x, c.y, cd.w, cd.h), closed: true }],
    point(p) {
      const page = ed().project().pages.find((x) => x.id === pageId);
      const el = makeDevice(cd, p.x, p.y, newId('c'));
      const els = (page?.elements ?? []).filter(isCab);
      const snap = cd.mount === 'rail' && !door ? snapToRail(el, els.filter((e) => e.item === 'rail'), els, ed().project().settings.layout.gap) : null;
      add(pg as Page, snap ? { ...el, ...snap } : el);
      if (rest.length) placeDevices(rest);
      else { end(); say(t('{n} devices placed.', { n: list.length })); }
    },
  }));
}

function selectedCab(min: number): { page: Page; ids: string[] } | null {
  const pg = layoutPage('any');
  if (!pg) return null;
  const ids = ed().selection.filter((id) => pg.elements.some((e) => e.id === id && isCab(e)));
  if (ids.length < min) { bad(t('Select at least {n} layout items first.', { n: min })); return null; }
  return { page: pg, ids };
}

function align(args: string): void {
  const mode = args.trim().toLowerCase() as AlignMode;
  if (!ALIGN_MODES.includes(mode)) return say(t('ALIGN left, right, top, bottom, hcenter or vcenter: aligns the selected items to the first one you selected.'));
  const s = selectedCab(2);
  if (!s) return;
  const cmds = alignCommands(s.page, s.ids, mode);
  if (!cmds.length) return say(t('Nothing to move: the items are already aligned.'));
  ed().exec({ type: 'batch', label: 'align', commands: cmds });
}
function distribute(args: string): void {
  const a = args.trim().toLowerCase();
  const axis = a.startsWith('v') ? 'v' : 'h';
  const s = selectedCab(3);
  if (!s) return;
  const cmds = distributeCommands(s.page, s.ids, axis);
  if (!cmds.length) return say(t('Nothing to move: the gaps are already equal.'));
  ed().exec({ type: 'batch', label: 'distribute', commands: cmds });
}

/** The device part (for the outline and the part code in messages). */
export const deviceName = (key: string): string => shortDesignation(key);
export const partOf = (key: string): PartDef | undefined => { const p = ed().project(); const u = p.devices.find((d) => d.designation === key)?.parts[0]; return u ? findPart(ed().lib, p.parts, u.part) : undefined; };

export const LAYOUT_RUN: Record<string, (args: string) => void> = {
  ENCLOSURE: (a) => {
    const q = a.trim().toLowerCase();
    const parts = enclosureParts();
    const hit = q ? parts.find((p) => p.id === q || p.code.toLowerCase() === q || (p.dimensions && q.replace(/\s/g, '') === `${p.dimensions.w}x${p.dimensions.h}x${p.dimensions.d}`)) : undefined;
    if (hit) return placeFramePart(hit.id);
    useLayout.getState().setTab('structure');
    ed().setDialog('layout');
    if (q) bad(t('No enclosure matches "{q}". Type its size like ENCLOSURE 800x1000x300 or pick one in the window.', { q }));
  },
  PLATE: (a) => {
    const q = a.trim().toLowerCase();
    const hit = q ? plateParts().find((p) => p.id === q || p.code.toLowerCase() === q || (p.dimensions && q.replace(/\s/g, '') === `${p.dimensions.w}x${p.dimensions.h}`)) : undefined;
    if (hit) return placeFramePart(hit.id);
    if (!q && layoutPage()) return go(rectItemSession('plate'));
    useLayout.getState().setTab('structure');
    ed().setDialog('layout');
  },
  RAIL: () => { if (layoutPage()) go(lineItemSession('rail')); },
  DUCT: () => { if (layoutPage()) go(lineItemSession('duct')); },
  ZONE: () => { if (layoutPage()) go(rectItemSession('zone')); },
  COVER: () => { if (layoutPage()) go(rectItemSession('cover')); },
  DIM: () => { if (layoutPage()) go(dimSession()); },
  PLACE: (a) => {
    const q = a.trim();
    if (!q) return void placeDevices([]);
    const bare = (x: string) => x.toLowerCase().replace(/^-/, '');
    const keys = unplacedDevices(ed().project(), ed().lib).filter((d) => d.key === q || bare(shortDesignation(d.key)) === bare(q)).map((d) => d.key);
    if (!keys.length) return bad(t('"{q}" is not an unplaced device of the schematic.', { q }));
    placeDevices(keys);
  },
  ALIGN: align,
  DISTRIBUTE: distribute,
  LAYOUT: () => { useLayout.getState().setTab('devices'); ed().setDialog('layout'); },
  SUGGEST: () => void useLayout.getState().suggest(),
  VIEW3D: () => ed().setDialog('layout3d'),
  DRILL: () => void useLayout.getState().exportDxf('drilling'),
};
