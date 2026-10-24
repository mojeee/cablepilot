// The cabinet layout read from the project (rule 1: the layout pages are part of the project, the
// devices on them are linked to the schematic by designation). Layout pages are drawn in real
// millimetres; the sheet gets the drawing at a standard scale. Pure.

import { sheetMm } from '../sheets';
import type { CabEl, CabItem, El, LayoutView, Page, PageLayout, Project } from '../model/types';

export const isCab = (e: El): e is CabEl => e.kind === 'cab';
export const isLayoutPage = (p: Page): p is Page & { layout: PageLayout } => p.type === 'layout' && !!p.layout;

/** Where the enclosure sits on a new layout page: room on the left and top for dimension lines. */
export const ENC_ORIGIN = { x: 120, y: 100 } as const;
/** Free room around the enclosure on a layout page (millimetres): dimension lines, notes, titles. */
export const PAGE_PAD = { left: 120, top: 100, right: 120, bottom: 120 } as const;

/** The extent of the drawing area of a page: a layout page's own size, else the sheet. */
export function pageExtent(p: Page): { w: number; h: number } {
  return isLayoutPage(p) ? { w: p.layout.w, h: p.layout.h } : sheetMm(p.size);
}

export interface Placed {
  el: CabEl;
  page: Page;
}
export interface Cabinet {
  front?: Page;
  doors: Page[];
  sides: Page[];
  enclosure?: CabEl;
  plate?: CabEl;
  /** The door's own frame on the first door page. */
  doorFrame?: CabEl;
  rails: Placed[];
  ducts: Placed[];
  zones: Placed[];
  covers: Placed[];
  dims: Placed[];
  devices: Placed[];
}

const byItem = (list: Placed[], item: CabItem) => list.filter((p) => p.el.item === item);

/** The layout of the project: the first front page carries the plate, rails and ducts; door pages carry the door devices. */
export function cabinetOf(project: Project): Cabinet {
  const fronts = project.pages.filter((p) => isLayoutPage(p) && p.layout.view === 'front');
  const doors = project.pages.filter((p) => isLayoutPage(p) && p.layout.view === 'door');
  const sides = project.pages.filter((p) => isLayoutPage(p) && p.layout.view === 'side');
  const all: Placed[] = [];
  for (const page of [...fronts, ...doors]) for (const el of page.elements) if (isCab(el)) all.push({ el, page });
  const front = fronts[0];
  const onFront = all.filter((p) => p.page === front);
  const doorAll = all.filter((p) => doors.includes(p.page));
  return {
    front, doors, sides,
    enclosure: onFront.find((p) => p.el.item === 'enclosure')?.el,
    plate: onFront.find((p) => p.el.item === 'plate')?.el,
    doorFrame: doorAll.find((p) => p.el.item === 'enclosure')?.el,
    rails: byItem(onFront, 'rail'), ducts: byItem(onFront, 'duct'), zones: byItem(onFront, 'zone'), covers: byItem(onFront, 'cover'), dims: byItem(onFront, 'dim'),
    devices: all.filter((p) => p.el.item === 'device' && p.el.designation),
  };
}

export const hasLayout = (project: Project): boolean => cabinetOf(project).devices.length > 0 || !!cabinetOf(project).plate;

export type Rect = [number, number, number, number];
export const boxOf = (e: Pick<CabEl, 'x' | 'y' | 'w' | 'h'>): Rect => [e.x, e.y, e.x + Math.abs(e.w), e.y + Math.abs(e.h)];
export const overlaps = (a: Rect, b: Rect, eps = 0.01): boolean => a[0] < b[2] - eps && a[2] > b[0] + eps && a[1] < b[3] - eps && a[3] > b[1] + eps;
export const inside = (a: Rect, outer: Rect, eps = 0.01): boolean => a[0] >= outer[0] - eps && a[1] >= outer[1] - eps && a[2] <= outer[2] + eps && a[3] <= outer[3] + eps;
export const centreOf = (e: Pick<CabEl, 'x' | 'y' | 'w' | 'h'>): { x: number; y: number } => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });

/** The origin of a placed item for exchange and 3D: the plate's corner for plate devices, the door's corner for door devices. */
export function originOf(cab: Cabinet, p: Placed): { x: number; y: number } {
  const door = cab.doors.includes(p.page);
  const frame = door ? p.page.elements.find((e): e is CabEl => isCab(e) && e.item === 'enclosure') : undefined;
  if (door) return frame ? { x: frame.x, y: frame.y } : { x: 0, y: 0 };
  return cab.plate ? { x: cab.plate.x, y: cab.plate.y } : cab.enclosure ? { x: cab.enclosure.x, y: cab.enclosure.y } : { x: 0, y: 0 };
}

/** The device's depth (mm): its own, else a default module depth. */
export const depthOf = (e: CabEl): number => e.d ?? 60;

export const viewOf = (p: Page): LayoutView | undefined => (isLayoutPage(p) ? p.layout.view : undefined);

/** Rail length: rails run along their longer side. */
export const isHorizontal = (e: CabEl): boolean => e.w >= e.h;

/** Standard reduction scales for drawings (ISO 5455: 1:2, 1:5, 1:10, 1:20, 1:50, 1:100; docs/to-verify.md) and the largest one that fits the box. */
export const SCALES = [1, 2, 5, 10, 20, 50, 100] as const;
export function scaleFor(w: number, h: number, boxW: number, boxH: number): number {
  for (const s of SCALES) if (w / s <= boxW && h / s <= boxH) return s;
  return SCALES[SCALES.length - 1];
}
