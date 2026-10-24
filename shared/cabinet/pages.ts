// Creating the layout pages (front, door, side view) for an enclosure: used by the layout suggestion, the
// import of a layout file and the layout templates, so they all make the same pages. Pure.

import type { Command } from '../commands';
import type { Project, Page } from '../model/types';
import type { SheetSize } from '../sheets';
import { drawingArea } from './draw';
import { cabinetOf, PAGE_PAD, scaleFor } from './model';

export interface LayoutPageIds {
  front: string;
  door: string;
  side: string;
}
export const DEFAULT_PAGE_IDS: LayoutPageIds = { front: 'lay-front', door: 'lay-door', side: 'lay-side' };

/** The smallest sheet (A3 up to A0) that shows the drawing at 1:10 or larger. */
export function sheetFor(project: Project, w: number, h: number): SheetSize {
  const probe = (size: SheetSize): Page => ({ id: '', type: 'layout', title: {}, size, templateId: '', elements: [] });
  return (['A3', 'A2', 'A1'] as const).find((sz) => { const a = drawingArea(project, probe(sz)); return scaleFor(w, h, a.w, a.h) <= 10; }) ?? 'A0';
}

/** Where new layout pages go: where the first layout page is now, else before the BOM and report pages, else at the end. */
export function layoutInsertIndex(project: Project): number {
  const i = project.pages.findIndex((p) => p.type === 'layout');
  if (i >= 0) return i;
  const j = project.pages.findIndex((p) => p.type === 'bom' || p.type === 'report');
  return j >= 0 ? j : project.pages.length;
}

/**
 * Commands that add the layout pages an enclosure needs and are missing, and widen the extent of the ones that exist.
 * `door` asks for a door page. Returns the commands and the ids of the pages.
 */
export function layoutPageCommands(project: Project, enc: { w: number; h: number; d?: number }, door: boolean, ids: LayoutPageIds = DEFAULT_PAGE_IDS): { cmds: Command[]; ids: LayoutPageIds } {
  const cab = cabinetOf(project);
  const used: LayoutPageIds = { front: cab.front?.id ?? ids.front, door: cab.doors[0]?.id ?? ids.door, side: cab.sides[0]?.id ?? ids.side };
  const taken = new Set(project.pages.map((p) => p.id));
  const at = layoutInsertIndex(project);
  const ext = { w: Math.round(enc.w + PAGE_PAD.left + PAGE_PAD.right), h: Math.round(enc.h + PAGE_PAD.top + PAGE_PAD.bottom) };
  const sideExt = { w: Math.round((enc.d ?? 300) + 320), h: Math.round(enc.h + 320) };
  const cmds: Command[] = [];
  const mk = (id: string, view: 'front' | 'door' | 'side', en: string, it: string, w: number, h: number, offset: number): Command => ({ type: 'page/add', index: at + offset, page: { id, type: 'layout', title: { en, it }, size: sheetFor(project, w, h), templateId: '', elements: [], layout: { view, w, h, ...(view === 'side' ? { of: used.front } : {}) } } });
  if (!taken.has(used.front)) cmds.push(mk(used.front, 'front', 'Cabinet layout, mounting plate', 'Layout quadro, piastra di montaggio', ext.w, ext.h, 0));
  else if (cab.front?.layout && (cab.front.layout.w < ext.w || cab.front.layout.h < ext.h)) cmds.push({ type: 'page/update', id: used.front, patch: { layout: { ...cab.front.layout, w: Math.max(cab.front.layout.w, ext.w), h: Math.max(cab.front.layout.h, ext.h) } } });
  if (door && !taken.has(used.door)) cmds.push(mk(used.door, 'door', 'Cabinet layout, door', 'Layout quadro, porta', ext.w, ext.h, 1));
  if (!taken.has(used.side)) cmds.push(mk(used.side, 'side', 'Cabinet layout, side view', 'Layout quadro, vista laterale', sideExt.w, sideExt.h, 2));
  else if (cab.sides[0]?.layout && (cab.sides[0].layout.w !== sideExt.w || cab.sides[0].layout.h !== sideExt.h || cab.sides[0].layout.of !== used.front)) cmds.push({ type: 'page/update', id: used.side, patch: { layout: { ...cab.sides[0].layout, w: sideExt.w, h: sideExt.h, of: used.front } } });
  return { cmds, ids: used };
}
