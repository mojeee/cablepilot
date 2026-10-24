// Placing devices (M6 part 3): snap to a DIN rail, align, distribute, the "not yet placed" list and the
// move command of the layout pages (a device dropped near a rail snaps onto it, a moved rail takes its
// devices along). Pure functions that return commands, so every edit is undoable.

import type { Command } from '../commands';
import { deviceIndex } from '../devices';
import { findPart, type Library } from '../library/types';
import type { CabEl, Page, Project, Rot } from '../model/types';
import { boxOf, cabinetOf, centreOf, isCab, isHorizontal, isLayoutPage, overlaps, type Cabinet } from './model';
import { cabinetDevices, partMount, type CabDevice } from './size';

/** A device's footprint on the plate for a rotation: quarter turns swap width and height. */
export const footprint = (w: number, h: number, rot: Rot | undefined): { w: number; h: number } => (rot === 90 || rot === 270 ? { w: h, h: w } : { w, h });

/** The cabinet device element for a BOM device, at (x, y) (top-left of the body). */
export function makeDevice(cd: CabDevice, x: number, y: number, id: string, extra: Partial<CabEl> = {}): CabEl {
  return { id, kind: 'cab', item: 'device', x, y, w: cd.w, h: cd.h, d: cd.d, designation: cd.key, ...extra };
}

/**
 * Snaps a rail-mounted device onto the nearest horizontal rail it overlaps: its centre goes on the rail's
 * centre line, it stays inside the rail's length and slides to the nearest free spot beside its neighbours.
 * Returns the changes (x, y, rail), or null when no rail is near.
 */
export function snapToRail(dev: CabEl, rails: CabEl[], devices: CabEl[], gap = 0): Pick<CabEl, 'x' | 'y' | 'rail'> | null {
  const c = centreOf(dev);
  let best: { r: CabEl; d: number } | null = null;
  for (const r of rails) {
    if (!isHorizontal(r)) continue;
    const xo = Math.min(dev.x + dev.w, r.x + r.w) - Math.max(dev.x, r.x);
    if (xo < Math.min(dev.w, r.w) * 0.4) continue;
    const dy = Math.abs(c.y - (r.y + r.h / 2));
    if (dy > Math.max(dev.h / 2, 30)) continue;
    if (!best || dy < best.d) best = { r, d: dy };
  }
  if (!best) return null;
  const r = best.r;
  const y = r.y + r.h / 2 - dev.h / 2;
  const others = devices.filter((o) => o.id !== dev.id && o.item === 'device' && Math.abs(o.y + o.h / 2 - (r.y + r.h / 2)) < Math.max(o.h, dev.h) / 2);
  const free = (x: number) => x >= r.x - 0.01 && x + dev.w <= r.x + r.w + 0.01 && !others.some((o) => overlaps([x, y, x + dev.w, y + dev.h], boxOf(o), 0.01));
  const clamp = (x: number) => Math.min(Math.max(x, r.x), Math.max(r.x, r.x + r.w - dev.w));
  const want = clamp(dev.x);
  const cands = [want, ...others.flatMap((o) => [o.x + o.w + gap, o.x - dev.w - gap])].filter(free);
  const x = cands.length ? cands.reduce((a, b) => (Math.abs(a - want) <= Math.abs(b - want) ? a : b)) : want;
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, rail: r.id };
}

/** The mounting of a device from its part: only rail devices snap to rails. */
export function mountOfDevice(project: Project, lib: Library, key: string): 'rail' | 'plate' | 'door' | undefined {
  const rec = project.devices.find((r) => r.designation === key);
  for (const u of rec?.parts ?? []) {
    const p = findPart(lib, project.parts, u.part);
    const m = p ? partMount(p) : 'none';
    if (m === 'rail' || m === 'plate' || m === 'door') return m;
  }
  return undefined;
}

/**
 * The command that moves elements on a layout page. On a front page rail devices snap onto a rail near
 * their new place, and the devices on a moved rail go with it. Other pages: a plain move.
 */
export function moveCommand(project: Project, lib: Library, pageId: string, ids: string[], dx: number, dy: number): Command {
  const plain: Command = { type: 'el/move', page: pageId, ids, dx, dy };
  const page = project.pages.find((p) => p.id === pageId);
  if (!page || !isLayoutPage(page) || page.layout.view !== 'front') return plain;
  const els = page.elements.filter(isCab);
  const sel = new Set(ids);
  const carried = els.filter((e) => e.item === 'device' && e.rail && sel.has(e.rail) && !sel.has(e.id)).map((e) => e.id);
  const all = new Set([...ids, ...carried]);
  const moved = (e: CabEl): CabEl => (all.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e);
  const after = els.map(moved);
  const rails = after.filter((e) => e.item === 'rail');
  const out: Command[] = [{ type: 'el/move', page: pageId, ids: [...all], dx, dy }];
  for (const e of after) {
    if (e.item !== 'device' || !sel.has(e.id) || !e.designation) continue;
    if (mountOfDevice(project, lib, e.designation) !== 'rail') continue;
    const snap = snapToRail(e, rails, after, project.settings.layout.gap);
    if (snap) out.push({ type: 'el/update', page: pageId, id: e.id, patch: { ...snap } });
    else if (e.rail && !rails.some((r) => r.id === e.rail && overlaps(boxOf(r), boxOf(e), 0))) out.push({ type: 'el/update', page: pageId, id: e.id, patch: { rail: undefined } });
  }
  return out.length === 1 ? out[0] : { type: 'batch', label: 'move', commands: out };
}

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter';
export const ALIGN_MODES: AlignMode[] = ['left', 'right', 'top', 'bottom', 'hcenter', 'vcenter'];

/** Aligns items to the first selected one (a device moved off its rail loses the rail link). */
export function alignCommands(page: Page, ids: string[], mode: AlignMode): Command[] {
  const els = ids.map((id) => page.elements.find((e) => e.id === id)).filter((e): e is CabEl => !!e && isCab(e));
  if (els.length < 2) return [];
  const ref = els[0];
  const out: Command[] = [];
  for (const e of els.slice(1)) {
    const patch: Partial<CabEl> = {};
    if (mode === 'left') patch.x = ref.x;
    if (mode === 'right') patch.x = ref.x + ref.w - e.w;
    if (mode === 'hcenter') patch.x = ref.x + ref.w / 2 - e.w / 2;
    if (mode === 'top') patch.y = ref.y;
    if (mode === 'bottom') patch.y = ref.y + ref.h - e.h;
    if (mode === 'vcenter') patch.y = ref.y + ref.h / 2 - e.h / 2;
    if (patch.y !== undefined && patch.y !== e.y && e.rail) patch.rail = undefined;
    if ((patch.x !== undefined && patch.x !== e.x) || (patch.y !== undefined && patch.y !== e.y)) out.push({ type: 'el/update', page: page.id, id: e.id, patch: { ...patch } });
  }
  return out;
}

/** Distributes items so the gaps between neighbours are equal; the outer two stay where they are. */
export function distributeCommands(page: Page, ids: string[], axis: 'h' | 'v'): Command[] {
  const els = ids.map((id) => page.elements.find((e) => e.id === id)).filter((e): e is CabEl => !!e && isCab(e));
  if (els.length < 3) return [];
  const pos = (e: CabEl) => (axis === 'h' ? e.x : e.y);
  const size = (e: CabEl) => (axis === 'h' ? e.w : e.h);
  const sorted = els.slice().sort((a, b) => pos(a) - pos(b));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const total = pos(last) + size(last) - pos(first);
  const gap = (total - sorted.reduce((s, e) => s + size(e), 0)) / (sorted.length - 1);
  const out: Command[] = [];
  let at = pos(first) + size(first) + gap;
  for (const e of sorted.slice(1, -1)) {
    const v = Math.round(at * 100) / 100;
    if (Math.abs(v - pos(e)) > 0.005) out.push({ type: 'el/update', page: page.id, id: e.id, patch: axis === 'h' ? { x: v } : { y: v, ...(e.rail ? { rail: undefined } : {}) } });
    at += size(e) + gap;
  }
  return out;
}

export interface Unplaced {
  device: CabDevice;
}
/** The devices of the schematic that belong in the cabinet and are not on a layout page yet. */
export function unplacedDevices(project: Project, lib: Library, cab: Cabinet = cabinetOf(project)): CabDevice[] {
  const placed = new Set(cab.devices.map((p) => p.el.designation));
  return cabinetDevices(project, lib).filter((d) => !placed.has(d.key));
}

/** Devices on layout pages whose designation is no longer in the schematic (renamed or deleted devices). */
export function orphanDevices(project: Project, cab: Cabinet = cabinetOf(project), lib?: Library): string[] {
  if (!lib) return [];
  const keys = new Set(deviceIndex(project, lib).devices.map((d) => d.key));
  return cab.devices.map((p) => p.el.designation as string).filter((k) => !keys.has(k));
}

/** Refreshes the size of devices from their parts (after the part's dimensions changed, for example from the ERP item master). */
export function syncSizeCommands(project: Project, lib: Library): Command[] {
  const cab = cabinetOf(project);
  const want = new Map(cabinetDevices(project, lib).map((d) => [d.key, d]));
  const out: Command[] = [];
  for (const p of cab.devices) {
    const cd = want.get(p.el.designation as string);
    if (!cd || p.el.custom) continue;
    const fp = footprint(cd.w, cd.h, p.el.rot);
    if (Math.abs(fp.w - p.el.w) > 0.01 || Math.abs(fp.h - p.el.h) > 0.01 || Math.abs((p.el.d ?? 0) - cd.d) > 0.01) out.push({ type: 'el/update', page: p.page.id, id: p.el.id, patch: { w: fp.w, h: fp.h, d: cd.d } });
  }
  return out;
}

/** A plain move command becomes the layout-aware one (rail snapping, rails take their devices) on layout pages; any other command is returned as it is. */
export function adaptMove(project: Project, lib: Library, cmd: Command): Command {
  return cmd.type === 'el/move' ? moveCommand(project, lib, cmd.page, cmd.ids, cmd.dx, cmd.dy) : cmd;
}
