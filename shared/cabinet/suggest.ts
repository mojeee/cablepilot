// The suggested layout (M6 part 3): from the schematic's devices and the library it proposes the enclosure
// and plate, rails, ducts and a place for every device, as commands the user previews, accepts and then edits
// with the normal tools. Items the user placed, moved or locked ("pinned") are never touched: a new
// suggestion places the rest around them. Every rule it applied is listed with its source. Pure.

import type { Claim } from '../ai/types';
import { apply, type Command } from '../commands';
import { t } from '../i18n';
import { newId as defaultId } from '../ids';
import type { Library, PartDef } from '../library/types';
import type { CabEl, Page, Project } from '../model/types';
import { ductFills } from './fill';
import { layoutPageCommands } from './pages';
import { cabinetOf, ENC_ORIGIN, isCab, overlaps, type Cabinet, type Rect } from './model';
import { cabinetDevices, type CabDevice, type LayoutGroup } from './size';

export interface Suggestion {
  commands: Command[];
  rules: Claim[];
  /** One plain line per change, for the list beside the preview. */
  summary: string[];
  /** Problems the user should look at: it does not fit, a duct is over its limit, sizes were assumed. */
  issues: string[];
  /** Devices placed by this suggestion, and items kept because the user placed or locked them. */
  placed: number;
  kept: number;
  fits: boolean;
  /** The page the preview should show. */
  page: string;
}

export interface SuggestOptions {
  newId?: (prefix?: string) => string;
  /** Ids to use for pages the suggestion has to create (default: lay-front, lay-door, lay-side). */
  pageIds?: { front: string; door: string; side: string };
}

const RAIL_H = 35; // DIN rail 35 mm wide (IEC 60715)
const MARGIN = 15; // plate edge to ducts and devices
const DOOR_GAP = 25;
const DOOR_MARGIN = 60;
const BEHIND_DOOR = 20; // free depth between the deepest plate device and the door (to verify)
const GROUPS: LayoutGroup[] = ['power', 'heavy', 'control', 'terminals'];

interface Frame {
  enc: CabEl;
  plate: CabEl;
}
const parts = (project: Project, lib: Library): PartDef[] => {
  const m = new Map<string, PartDef>(lib.parts);
  for (const p of project.parts) m.set(p.id, p);
  return [...m.values()];
};
const area = (p: PartDef) => (p.dimensions ? p.dimensions.w * p.dimensions.h : 0);

/** Library enclosures with the largest plate that fits inside each (the plate is at least 100 mm smaller each way), smallest first. */
function candidates(project: Project, lib: Library): { enc: PartDef; plate?: PartDef }[] {
  const all = parts(project, lib).filter((p) => p.category === 'enclosures' && p.dimensions);
  const encs = all.filter((p) => (p.dimensions?.d ?? 0) > 10).sort((a, b) => area(a) - area(b));
  const plates = all.filter((p) => (p.dimensions?.d ?? 0) <= 10);
  return encs.map((enc) => ({ enc, plate: plates.filter((p) => p.dimensions && p.dimensions.w <= (enc.dimensions?.w ?? 0) - 100 && p.dimensions.h <= (enc.dimensions?.h ?? 0) - 100).sort((a, b) => area(b) - area(a))[0] }));
}
const ductParts = (project: Project, lib: Library): PartDef[] => parts(project, lib).filter((p) => p.id.startsWith('generic-cable-duct') || (p.category === 'accessories' && p.data.Section && p.dimensions)).filter((p) => p.dimensions).sort((a, b) => (a.dimensions?.h ?? 0) * (a.dimensions?.d ?? 0) - (b.dimensions?.h ?? 0) * (b.dimensions?.d ?? 0));
const railPart = (project: Project, lib: Library): PartDef | undefined => parts(project, lib).find((p) => p.id.startsWith('generic-din-rail'));

interface Row {
  group: LayoutGroup;
  devs: CabDevice[];
  /** Positions chosen: device key to x. */
  xs: number[];
  y: number;
  h: number;
  rail: boolean;
}

interface Attempt {
  rows: Row[];
  ducts: { x: number; y: number; w: number; h: number; vertical: boolean }[];
  fits: boolean;
  /** Plate area needed for devices, clearances and ducts, with the spare space. */
  needed: number;
  bottom: number;
}

/** Packs devices into rows of the plate, top to bottom: power, plate-mounted, control, terminals. Obstacles are the pinned items of the plate. */
function pack(devs: CabDevice[], plate: Rect, ductW: number, gap: number, clear: number, obstacles: Rect[], spare: number, fresh: boolean): Attempt {
  const x0 = plate[0] + MARGIN + ductW + gap, x1 = plate[2] - MARGIN;
  const rows: Row[] = [];
  // A fresh layout starts with a duct along the top; a layout that keeps the user's structure only adds ducts for the rows it adds.
  const dx0 = plate[0] + MARGIN + ductW, dw = plate[2] - plate[0] - 2 * MARGIN - ductW;
  const ducts: Attempt['ducts'] = fresh ? [{ x: dx0, y: plate[1] + MARGIN, w: dw, h: ductW, vertical: false }] : [];
  let y = plate[1] + MARGIN + (fresh ? ductW : 0);
  let fits = true;
  let needed = 0;
  const bump = (top: number, h: number): number => {
    // Pinned items that span most of the row (rails, ducts, wide devices) push the row down.
    let at = top;
    for (let again = true; again;) {
      again = false;
      for (const o of obstacles) if (o[2] - o[0] >= (x1 - x0) * 0.5 && overlaps([x0, at, x1, at + h], o)) { at = o[3] + gap; again = true; }
    }
    return at;
  };
  for (const g of GROUPS) {
    const queue = devs.filter((d) => d.group === g);
    while (queue.length) {
      // One row: devices left to right while they fit between the obstacles; the rest wraps.
      const h0 = Math.max(...queue.slice(0, 12).map((d) => d.h));
      const top = bump(y + clear, h0);
      const chosen: CabDevice[] = [];
      const xs: number[] = [];
      let x = x0;
      let rowH = 0;
      for (const d of queue) {
        let at = x;
        for (let again = true; again;) {
          again = false;
          for (const o of obstacles) if (overlaps([at, top, at + d.w, top + d.h], o)) { at = o[2] + gap; again = true; }
        }
        if (at + d.w > x1 + 0.01) break;
        chosen.push(d); xs.push(at);
        x = at + d.w + gap;
        rowH = Math.max(rowH, d.h);
      }
      if (!chosen.length) { fits = false; chosen.push(queue[0]); xs.push(x0); rowH = queue[0].h; }
      queue.splice(0, chosen.length);
      rows.push({ group: g, devs: chosen, xs, y: top, h: rowH, rail: chosen.every((d) => d.mount === 'rail') });
      for (const d of chosen) needed += (d.w + gap) * (d.h + 2 * clear);
      y = top + rowH + clear;
      ducts.push({ x: dx0, y, w: dw, h: ductW, vertical: false });
      y += ductW;
    }
  }
  // The vertical duct on the left joins the horizontal ones.
  if (fresh) ducts.push({ x: plate[0] + MARGIN, y: plate[1] + MARGIN, w: ductW, h: Math.max(0, y - (plate[1] + MARGIN)), vertical: true });
  if (y > plate[3] - MARGIN + 0.01) fits = false;
  needed += ducts.reduce((s, d) => s + d.w * d.h, 0);
  const inner = (plate[2] - plate[0]) * (plate[3] - plate[1]);
  if (needed * (1 + spare / 100) > inner) fits = false;
  return { rows, ducts, fits, needed, bottom: y };
}

/** Plate-mounted and rail devices of the front page, door devices of the door page: one layout attempt for an enclosure choice. */
export function suggestLayout(project: Project, lib: Library, opts: SuggestOptions = {}): Suggestion {
  const nid = opts.newId ?? defaultId;
  const cfg = project.settings.layout;
  const cab = cabinetOf(project);
  const all = cabinetDevices(project, lib);
  const issues: string[] = [];
  const rules: Claim[] = [];
  const summary: string[] = [];
  const commands: Command[] = [];

  // Pinned: what the user placed (not made by a suggestion) or locked. Auto items are replaced.
  const onFront = (cab.front?.elements ?? []).filter(isCab);
  // A rail a pinned device sits on stays, so the device keeps its rail.
  const carried = new Set<string | undefined>(onFront.filter((e) => e.item === 'device' && e.rail && !(e.auto && !e.locked)).map((e) => e.rail));
  // Pinned items live in the coordinates of the enclosure and plate that are there: those stay too.
  const anchored = onFront.some((e) => (!(e.auto && !e.locked) || carried.has(e.id)) && e.item !== 'enclosure' && e.item !== 'plate' && e.item !== 'dim');
  // With anything of the user's on the plate the structure (enclosure, plate, rails, ducts) stays: only devices are placed again.
  const structure = (e: CabEl) => e.item === 'enclosure' || e.item === 'plate' || e.item === 'rail' || e.item === 'duct';
  const isAuto = (e: CabEl) => !!e.auto && !e.locked && !carried.has(e.id) && !(anchored && structure(e));
  const pinnedFront = onFront.filter((e) => !isAuto(e));
  const pinnedDoors = cab.doors.flatMap((pg) => pg.elements.filter(isCab).filter((e) => !(e.auto && !e.locked)));
  const pinnedKeys = new Set([...pinnedFront, ...pinnedDoors].filter((e) => e.item === 'device').map((e) => e.designation));
  const todo = all.filter((d) => !pinnedKeys.has(d.key));
  let plateDevs = todo.filter((d) => d.mount !== 'door');
  const doorDevs = todo.filter((d) => d.mount === 'door');
  // Free room on rails the user drew (or that carry devices the user placed) is filled first, by the group of the devices already there.
  const preplaced: { d: CabDevice; x: number; y: number; rail: string }[] = [];
  {
    const byKey = new Map(all.map((d) => [d.key, d]));
    const box = (e: CabEl): Rect => [e.x, e.y, e.x + e.w, e.y + e.h];
    for (const r of pinnedFront.filter((e) => e.item === 'rail' && e.w >= e.h).sort((a, b) => a.y - b.y || a.x - b.x)) {
      const cy = r.y + r.h / 2;
      const g = onFront.filter((e) => e.item === 'device' && e.rail === r.id).map((e) => byKey.get(e.designation ?? '')?.group)[0];
      const blockers = pinnedFront.filter((e) => e.item !== 'rail' && e.item !== 'enclosure' && e.item !== 'plate' && e.item !== 'dim' && overlaps([r.x, cy - 40, r.x + r.w, cy + 40], box(e)));
      let x = r.x;
      for (const d of plateDevs.filter((q) => q.mount === 'rail' && (!g || q.group === g))) {
        let at = x;
        for (let again = true; again;) { again = false; for (const o of blockers) if (overlaps([at, cy - d.h / 2, at + d.w, cy + d.h / 2], box(o))) { at = o.x + o.w + cfg.gap; again = true; } }
        if (at + d.w > r.x + r.w + 0.01) break;
        preplaced.push({ d, x: at, y: cy - d.h / 2, rail: r.id });
        plateDevs = plateDevs.filter((q) => q !== d);
        x = at + d.w + cfg.gap;
      }
    }
  }
  const keptCount = pinnedFront.filter((e) => e.item === 'device').length + pinnedDoors.filter((e) => e.item === 'device').length;

  // Enclosure and plate: kept when the user chose them; else the smallest library choice where everything fits.
  const maxDepth = Math.max(0, ...all.filter((d) => d.mount !== 'door').map((d) => d.d));
  const ductChoices = ductParts(project, lib);
  const rail = railPart(project, lib);
  const pinnedEnc = pinnedFront.find((e) => e.item === 'enclosure');
  const pinnedPlate = pinnedFront.find((e) => e.item === 'plate');
  // Obstacles: what is pinned, with a rail and the devices on it as one block (the row), and the devices placed on kept rails.
  const obstaclesOf = (plate: Rect): Rect[] => {
    const out: Rect[] = [];
    const onRail = (e: CabEl, r: CabEl) => e.rail === r.id;
    for (const e of pinnedFront) {
      if (e.item === 'enclosure' || e.item === 'plate' || e.item === 'dim' || (e.item === 'device' && e.rail && pinnedFront.some((r) => r.id === e.rail))) continue;
      if (e.item === 'rail') {
        const xs: Rect[] = [[e.x, e.y, e.x + e.w, e.y + e.h]];
        for (const d of pinnedFront) if (d.item === 'device' && onRail(d, e)) xs.push([d.x, d.y, d.x + d.w, d.y + d.h]);
        for (const q of preplaced) if (q.rail === e.id) xs.push([q.x, q.y, q.x + q.d.w, q.y + q.d.h]);
        out.push([Math.min(...xs.map((b) => b[0])), Math.min(...xs.map((b) => b[1])) - cfg.rowClearance, Math.max(...xs.map((b) => b[2])), Math.max(...xs.map((b) => b[3])) + cfg.rowClearance]);
      } else out.push([e.x, e.y, e.x + e.w, e.y + e.h]);
    }
    return out.filter((r) => overlaps(r, plate, 0));
  };

  interface Choice { frame: Frame; encPart?: PartDef; platePart?: PartDef; attempt: Attempt; duct: PartDef | undefined; ductW: number; ductD: number }
  const tryChoice = (encPart: PartDef | undefined, platePart: PartDef | undefined, ductIdx: number): Choice => {
    let enc: CabEl;
    let plate: CabEl;
    if (pinnedEnc) enc = pinnedEnc;
    else {
      const d = encPart?.dimensions ?? { w: 800, h: 1000, d: 300 };
      enc = { id: nid('c'), kind: 'cab', item: 'enclosure', x: ENC_ORIGIN.x, y: ENC_ORIGIN.y, w: d.w, h: d.h, d: d.d, designation: 'A1', ...(encPart ? { part: encPart.id } : {}), auto: true };
    }
    if (pinnedPlate) plate = pinnedPlate;
    else {
      const pd = platePart?.dimensions ?? { w: enc.w - 100, h: enc.h - 100, d: 3 };
      plate = { id: nid('c'), kind: 'cab', item: 'plate', x: enc.x + (enc.w - pd.w) / 2, y: enc.y + (enc.h - pd.h) / 2, w: pd.w, h: pd.h, d: pd.d, designation: 'MP1', ...(platePart ? { part: platePart.id } : {}), auto: true };
    }
    const duct = ductChoices[Math.min(ductIdx, ductChoices.length - 1)];
    const ductW = duct?.dimensions ? duct.dimensions.h : 60;
    const ductD = duct?.dimensions ? duct.dimensions.d : 60;
    const pr: Rect = [plate.x, plate.y, plate.x + plate.w, plate.y + plate.h];
    const attempt = pack(plateDevs, pr, ductW, cfg.gap, cfg.rowClearance, obstaclesOf(pr), cfg.sparePct, !anchored);
    if (enc.d !== undefined && maxDepth + (plate.d ?? 3) + BEHIND_DOOR > enc.d) attempt.fits = false;
    return { frame: { enc, plate }, encPart, platePart, attempt, duct, ductW, ductD };
  };

  const build = (c: Choice): { cmds: Command[]; page: string; project: Project } => {
    const cmds: Command[] = [];
    const { enc, plate } = c.frame;
    const door0 = doorDevs.length + pinnedDoors.filter((e) => e.item === 'device').length > 0 || cab.doors.length > 0;
    const pg = layoutPageCommands(project, enc, door0, opts.pageIds);
    cmds.push(...pg.cmds);
    const frontId = pg.ids.front, doorId = pg.ids.door;
    // Remove what an earlier suggestion made (auto and not locked), on every layout page.
    for (const pg of [cab.front, ...cab.doors].filter((p): p is Page => !!p)) {
      const ids = pg.elements.filter(isCab).filter(isAuto).map((e) => e.id);
      if (ids.length) cmds.push({ type: 'el/remove', page: pg.id, ids });
    }
    // The new front page items.
    const add: CabEl[] = [];
    if (!pinnedEnc) add.push(enc);
    if (!pinnedPlate) add.push(plate);
    const railItems: CabEl[] = [];
    // Labels continue after the rails and ducts that are kept.
    const labelNo = (prefix: string, item: 'rail' | 'duct') => Math.max(0, ...pinnedFront.filter((e) => e.item === item).map((e) => Number((e.designation ?? '').replace(prefix, '')) || 0));
    let n = labelNo('R', 'rail');
    for (const r of c.attempt.rows) {
      if (!r.rail) continue;
      n++;
      const cy = r.y + r.h / 2;
      const x0 = plate.x + MARGIN + c.ductW + cfg.gap, x1 = plate.x + plate.w - MARGIN;
      const el: CabEl = { id: nid('c'), kind: 'cab', item: 'rail', x: x0, y: cy - RAIL_H / 2, w: x1 - x0, h: RAIL_H, designation: `R${n}`, ...(rail ? { part: rail.id } : {}), auto: true };
      railItems.push(el);
      r.devs.forEach((d, i) => add.push({ id: nid('c'), kind: 'cab', item: 'device', x: round(r.xs[i]), y: round(cy - d.h / 2), w: d.w, h: d.h, d: d.d, designation: d.key, rail: el.id, auto: true }));
    }
    for (const r of c.attempt.rows) if (!r.rail) r.devs.forEach((d, i) => add.push({ id: nid('c'), kind: 'cab', item: 'device', x: round(r.xs[i]), y: round(r.y), w: d.w, h: d.h, d: d.d, designation: d.key, auto: true }));
    for (const q of preplaced) add.push({ id: nid('c'), kind: 'cab', item: 'device', x: round(q.x), y: round(q.y), w: q.d.w, h: q.d.h, d: q.d.d, designation: q.d.key, rail: q.rail, auto: true });
    add.push(...railItems);
    let dn = labelNo('D', 'duct');
    for (const d of c.attempt.ducts) { dn++; add.push({ id: nid('c'), kind: 'cab', item: 'duct', x: d.x, y: d.y, w: d.w, h: d.h, d: c.ductD, designation: `D${dn}`, ...(c.duct ? { part: c.duct.id } : {}), auto: true }); }
    // A cable-entry zone below the lowest duct when there is room, and the dimension lines of enclosure, plate and rails.
    const lowest = Math.max(c.attempt.bottom, ...pinnedFront.filter((e) => e.item !== 'enclosure' && e.item !== 'plate' && e.item !== 'dim' && e.item !== 'zone').map((e) => e.y + e.h));
    const entryTop = anchored ? lowest + 5 : c.attempt.bottom;
    if (plate.y + plate.h - entryTop >= 30) {
      // The cable entry sits at the bottom edge of the plate: a band of at most 60 mm.
      const h = Math.min(60, plate.y + plate.h - entryTop - 5);
      add.push({ id: nid('c'), kind: 'cab', item: 'zone', x: plate.x + MARGIN, y: plate.y + plate.h - 5 - h, w: plate.w - 2 * MARGIN, h, note: dtEntry(project), auto: true });
    }
    const dim = (x: number, y: number, w: number, h: number, d: number): CabEl => ({ id: nid('c'), kind: 'cab', item: 'dim', x, y, w, h, d, auto: true });
    if (!pinnedEnc) add.push(dim(enc.x, enc.y + enc.h, enc.w, 0, 45), dim(enc.x, enc.y, 0, enc.h, 45));
    add.push(dim(plate.x, plate.y + plate.h, plate.w, 0, 20), dim(plate.x + plate.w, plate.y, 0, plate.h, -20 - 0));
    let prevY = plate.y;
    for (const r of railItems) { const cy = r.y + r.h / 2; add.push(dim(enc.x + enc.w, prevY, 0, cy - prevY, 28 + 0)); prevY = cy; }
    // Devices last: they are on top of rails and ducts, so a click on a device picks the device.
    add.sort((a, b) => Number(a.item === 'device') - Number(b.item === 'device'));
    if (add.length) cmds.push({ type: 'el/add', page: frontId, elements: add });
    // The door page.
    if (doorDevs.length && (!pinnedDoors.length || true)) {
      const doorFrame: CabEl = { ...enc, id: nid('c'), designation: enc.designation, auto: true };
      const door: CabEl[] = [];
      if (!cab.doors[0] || !cab.doors[0].elements.some((e) => isCab(e) && e.item === 'enclosure')) door.push(doorFrame);
      const ox = enc.x + DOOR_MARGIN, ow = enc.w - 2 * DOOR_MARGIN;
      let x = ox, y = enc.y + DOOR_MARGIN, rowH = 0;
      for (const d of doorDevs.slice().sort((a, b) => b.w * b.h - a.w * a.h || a.order[0] - b.order[0])) {
        if (x + d.w > ox + ow && x > ox) { x = ox; y += rowH + DOOR_GAP; rowH = 0; }
        door.push({ id: nid('c'), kind: 'cab', item: 'device', x, y, w: d.w, h: d.h, d: d.d, designation: d.key, auto: true });
        x += d.w + DOOR_GAP; rowH = Math.max(rowH, d.h);
      }
      cmds.push({ type: 'el/add', page: doorId, elements: door });
    }
    const next = apply(project, { type: 'batch', label: 'x', commands: cmds }, { lib });
    return { cmds, page: frontId, project: next };
  };

  // Choose: the smallest enclosure where everything fits, then upsize the ducts until their fill is under the limit.
  const cands = pinnedEnc ? [{ enc: undefined as PartDef | undefined, plate: undefined as PartDef | undefined }] : candidates(project, lib);
  let choice: Choice | undefined;
  for (const cd of cands) {
    const c = tryChoice(cd.enc, cd.plate, 0);
    choice = c;
    if (c.attempt.fits) break;
  }
  if (!choice) choice = tryChoice(undefined, undefined, 0);
  let built = build(choice);
  let ductIdx = 0;
  let over: string[] = [];
  for (; ; ) {
    const fills = ductFills(built.project, lib);
    over = fills.filter((f) => f.over).map((f) => f.label);
    if (!over.length || ductIdx >= ductChoices.length - 1) break;
    ductIdx++;
    choice = tryChoice(choice.encPart, choice.platePart, ductIdx);
    built = build(choice);
  }
  if (over.length) issues.push(t('Duct fill is over {max} % in {ducts} even with the largest duct; split the wiring or add a duct.', { max: cfg.ductFillMax, ducts: over.join(', ') }));
  if (!choice.attempt.fits) issues.push(t('The devices do not fit the plate with {spare} % spare space and the clearances; choose a larger enclosure or move items by hand.', { spare: cfg.sparePct }));
  const assumed = todo.filter((d) => d.assumed).length;
  if (assumed) issues.push(t('{n} devices have no dimensions in their part; a default size of {w} x {h} mm is used. Set the real size.', { n: assumed, w: 45, h: 90 }));
  commands.push(...built.cmds);

  const { enc, plate } = choice.frame;
  summary.push(pinnedEnc ? t('Enclosure kept: {w} x {h} x {d} mm', { w: Math.round(enc.w), h: Math.round(enc.h), d: Math.round(enc.d ?? 0) }) : t('Enclosure {w} x {h} x {d} mm, plate {pw} x {ph} mm', { w: Math.round(enc.w), h: Math.round(enc.h), d: Math.round(enc.d ?? 0), pw: Math.round(plate.w), ph: Math.round(plate.h) }));
  summary.push(t('{n} devices on {rows} rows, {door} on the door, {ducts} ducts', { n: plateDevs.length + preplaced.length, rows: choice.attempt.rows.length, door: doorDevs.length, ducts: choice.attempt.ducts.length }));
  if (keptCount) summary.push(t('{n} devices you placed or locked stay where they are', { n: keptCount }));

  const settingsRef = t('Project settings: layout');
  const rail35 = t('DIN rail 35 mm');
  rules.push(
    { text: t('Enclosure and plate: the smallest library choice that holds the devices, the ducts and {spare} % spare space.', { spare: cfg.sparePct }), source: { kind: 'library', ref: [choice.encPart?.code, choice.platePart?.code].filter(Boolean).join(', ') || t('dimensions of the parts') } },
    { text: t('Power devices at the top, then plate-mounted devices, control devices below, terminals in the bottom row near the cable entry.'), source: { kind: 'suggestion', ref: t('company convention, change it by hand') } },
    { text: t('Devices follow the order of the schematic within their group.'), source: { kind: 'project', ref: t('Page order and position of the devices') } },
    { text: t('Each rail row has a {rail} with the devices centred on it, {gap} mm between devices and {clear} mm above and below.', { rail: rail35, gap: cfg.gap, clear: cfg.rowClearance }), source: { kind: 'standard', ref: 'IEC 60715' } },
    { text: t('Wire ducts above and below every row and one vertical duct; the fill rate of each duct stays under {max} %.', { max: cfg.ductFillMax }), source: { kind: 'project', ref: settingsRef } },
    { text: t('Devices whose part is mounted in the door (operator devices, HMI panels) go on the door page.'), source: { kind: 'library', ref: t('Mounting of the part') } },
    { text: t('The plate is at least 100 mm smaller than the enclosure in both directions; the deepest device plus the plate plus {n} mm must fit the depth.', { n: BEHIND_DOOR }), source: { kind: 'suggestion', ref: t('confirm with the enclosure data sheet') } },
  );
  if (pinnedFront.some((e) => e.item === 'zone')) rules.push({ text: t('No-mount zones you drew are kept free.'), source: { kind: 'project', ref: t('Layout page') } });
  if (keptCount) rules.push({ text: t('Items you placed, moved or locked stay put; only the rest was arranged.'), source: { kind: 'project', ref: t('Layout page') } });
  return { commands, rules, summary, issues, placed: todo.length, kept: keptCount, fits: choice.attempt.fits && !over.length, page: built.page };
}

const round = (v: number) => Math.round(v * 100) / 100;
const dtEntry = (project: Project): string => (project.settings.drawingLanguage === 'it' ? 'Ingresso cavi' : 'Cable entry');

export type { Cabinet };
