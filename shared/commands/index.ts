// The command layer (CLAUDE.md, Architecture): every edit, import and renumbering is a command,
// plain data, applied to the project by `apply`. Nothing in the UI mutates the project. Undo and
// redo are in history.ts; autosave and (later) the AI use the same path.

import { pinWorld } from '../draw/symbol';
import { junctionCandidates, needsJunction, normalizePoints, samePt } from '../geometry/wires';
import { boxPinsWorld } from '../draw/box';
import { keyOf } from '../devices';
import type { Library, MacroDef, PartDef } from '../library/types';
import { withProjectSymbols } from '../library/types';
import type { SymbolDef } from '../library/types';
import { placeMacro } from '../macros';
import type { Layer, IssueStatus, LoadData, Revision, BoxEl, CableRec, DeviceRec, El, JunctionEl, Page, PartUse, Potential, Project, ProjectPart, ProjectSettings, Pt, RectEl, Rot, SymbolEl, Template, WireEl, WireClass, WireType, Asset } from '../model/types';
import { fullDesignation, nextDesignation, parseDesignation, renumber } from '../numbering';
import { terminalStrips } from '../reports';
import { renumberWires } from '../wires';
import { makeSnapshot } from '../revisions';
import { applyChannelEdits, assignEdits, type ChannelEdit } from '../plc';

export type Command =
  | { type: 'project/set'; name?: string; properties?: Record<string, string>; assembly?: Record<string, string> }
  | { type: 'project/settings'; settings: Partial<ProjectSettings> }
  | { type: 'project/potentials'; potentials: Potential[] }
  | { type: 'template/upsert'; template: Template }
  | { type: 'template/remove'; id: string }
  | { type: 'asset/add'; id: string; asset: Asset }
  | { type: 'symbol/embed'; def: SymbolDef }
  | { type: 'page/add'; page: Page; index?: number }
  | { type: 'page/remove'; id: string }
  | { type: 'page/move'; id: string; index: number }
  | { type: 'page/update'; id: string; patch: Partial<Omit<Page, 'id' | 'elements'>> }
  | { type: 'el/add'; page: string; elements: El[] }
  | { type: 'el/update'; page: string; id: string; patch: Record<string, unknown> }
  | { type: 'el/remove'; page: string; ids: string[] }
  | { type: 'el/move'; page: string; ids: string[]; dx: number; dy: number }
  | { type: 'el/rotate'; page: string; ids: string[] }
  | { type: 'el/mirror'; page: string; ids: string[] }
  | { type: 'symbol/place'; page: string; element: SymbolEl; autoNumber?: boolean }
  | { type: 'wire/add'; page: string; id: string; points: Pt[]; potential?: string; conductors?: number }
  | { type: 'designation/renumber'; page?: string }
  /** Numbers the wires automatically (the whole project, or the nets that touch one page). */
  | { type: 'wire/renumber'; page?: string }
  /** Numbers the terminals of every strip 1, 2, 3... in reading order. */
  | { type: 'terminal/renumber' }
  | { type: 'project/wires'; wireClasses?: WireClass[]; wireTypes?: WireType[] }
  | { type: 'cable/set'; cable: CableRec }
  | { type: 'cable/remove'; id: string }
  | { type: 'box/place'; page: string; element: BoxEl; autoNumber?: boolean }
  /** Sets one element's designation without renaming the rest of its device: links it to another device. */
  | { type: 'device/relink'; page: string; id: string; designation: string }
  /** Device data: parts, user fields (empty text removes a field), the parent assembly (null clears it). */
  | { type: 'device/update'; key: string; patch: { parts?: PartUse[]; fields?: Record<string, string>; parent?: string | null; load?: LoadData | null } }
  | { type: 'part/embed'; def: PartDef }
  /** Sets the body size of a part in this project (an embedded copy of a library part, made when needed): the ERP item master, M6 part 3. */
  | { type: 'part/dims'; id: string; dims: { w: number; h: number; d: number } }
  | { type: 'projectPart/set'; part: ProjectPart }
  | { type: 'projectPart/remove'; id: string }
  /** Draws a dashed outline for an assembly (rect.assembly is its designation) and nests the devices in it. */
  | { type: 'assembly/create'; page: string; rect: RectEl; children: string[] }
  | { type: 'macro/place'; page: string; macro: MacroDef; x: number; y: number; prefix: string }
  /** Sets the issue status of the set (for proposal, approval, construction, as built). */
  | { type: 'issue/status'; status: IssueStatus }
  /** Issues a revision: stores the number, date, description and names with a snapshot of every page, device, wire and part, and sets the status and the title-block fields. */
  | { type: 'revision/issue'; revision: Omit<Revision, 'pages' | 'inventory'> }
  /** PLC channel edits: address, tag and comment of card channels (or the address of a channel symbol). One undo step, also for an import. */
  | { type: 'plc/channels'; edits: ChannelEdit[] }
  /** Gives channels their addresses by the project's scheme: only empty ones, or all. */
  | { type: 'plc/assign'; all?: boolean }
  /** Adds or replaces a layer: state, colour and line type of a built-in layer, or a user layer. */
  | { type: 'layer/set'; layer: Layer }
  /** Removes a user layer; its elements go back to the default layer of their kind. */
  | { type: 'layer/remove'; id: string }
  | { type: 'batch'; label: string; commands: Command[] };

export interface Ctx {
  lib: Library;
}

const mapPage = (p: Project, id: string, fn: (pg: Page) => Page): Project => {
  const i = p.pages.findIndex((x) => x.id === id);
  if (i < 0) return p;
  const next = fn(p.pages[i]);
  if (next === p.pages[i]) return p;
  const pages = p.pages.slice();
  pages[i] = next;
  return { ...p, pages };
};

/** Removes junction dots where fewer than three wire branches meet. */
export function cleanupJunctions(pg: Page): Page {
  const keep = pg.elements.filter((e) => e.kind !== 'junction' || needsJunction(pg, { x: e.x, y: e.y }));
  return keep.length === pg.elements.length ? pg : { ...pg, elements: keep };
}

/** Adds junction dots where a wire starts, ends or is met by another wire's end and three or more branches meet. */
function addJunctions(pg: Page, wire: WireEl): Page {
  const have = (pg.elements.filter((e): e is JunctionEl => e.kind === 'junction'));
  const add: JunctionEl[] = [];
  for (const p of junctionCandidates(pg, wire)) {
    if (have.some((j) => samePt(j, p)) || add.some((j) => samePt(j, p))) continue;
    if (needsJunction(pg, p)) add.push({ id: `${wire.id}-j${add.length + 1}`, kind: 'junction', x: p.x, y: p.y });
  }
  return add.length ? { ...pg, elements: [...pg.elements, ...add] } : pg;
}

/** Moves one end of a wire, inserting a corner when the adjacent segment would turn diagonal. */
export function moveWireEnd(points: Pt[], end: 'start' | 'end', to: Pt): Pt[] {
  const pts = end === 'start' ? points.slice() : points.slice().reverse();
  const p = pts[0], q = pts[1];
  const out = [to, ...pts.slice(1)];
  if (to.x !== q.x && to.y !== q.y) {
    const wasHorizontal = p.y === q.y;
    out.splice(1, 0, wasHorizontal ? { x: to.x, y: q.y } : { x: q.x, y: to.y });
  }
  const n = normalizePoints(out);
  return end === 'start' ? n : n.reverse();
}

type PointMap = (p: Pt) => Pt;

/**
 * Applies a geometric transform to the selected elements. Wires that are not selected but end on a
 * pin or junction of a moved element follow it (rubber band), keeping their segments orthogonal.
 */
function transform(pg: Page, ids: string[], f: PointMap, mode: 'move' | 'rotate' | 'mirror', lib: Library): Page {
  const sel = new Set(ids);
  const oldAnchors: Pt[] = [];
  const newAnchors: Pt[] = [];
  const elements = pg.elements.map((e): El => {
    if (!sel.has(e.id)) return e;
    switch (e.kind) {
      case 'symbol': {
        const def = lib.symbols.get(e.symbolId);
        const np = f({ x: e.x, y: e.y });
        let next: SymbolEl = { ...e, x: np.x, y: np.y };
        if (mode === 'rotate') next = { ...next, rot: ((e.rot + 90) % 360) as Rot };
        if (mode === 'mirror') next = { ...next, mirror: !e.mirror, rot: ((360 - e.rot) % 360) as Rot };
        if (def) {
          const before = pinWorld(def, e), after = pinWorld(def, next);
          before.forEach((b, i) => { oldAnchors.push({ x: b.x, y: b.y }); newAnchors.push({ x: after[i].x, y: after[i].y }); });
        }
        return next;
      }
      case 'junction': {
        const np = f(e);
        oldAnchors.push({ x: e.x, y: e.y });
        newAnchors.push(np);
        return { ...e, x: np.x, y: np.y };
      }
      case 'box': {
        // A box moves with its pins (wires follow); it has no rotation or mirror.
        if (mode !== 'move') return e;
        const np = f({ x: e.x, y: e.y });
        const moved = { ...e, x: np.x, y: np.y };
        const before = boxPinsWorld(e), after = boxPinsWorld(moved);
        before.forEach((b, i) => { oldAnchors.push({ x: b.x, y: b.y }); newAnchors.push({ x: after[i].x, y: after[i].y }); });
        return moved;
      }
      case 'wire':
      case 'line': return { ...e, points: e.points.map(f) } as El;
      case 'text': { const np = f(e); return { ...e, x: np.x, y: np.y, rot: mode === 'rotate' ? (e.rot + 90) % 360 : e.rot }; }
      case 'rect':
      case 'image': {
        const a = f({ x: e.x, y: e.y }), b = f({ x: e.x + e.w, y: e.y + e.h });
        return { ...e, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
      }
      case 'cab': {
        // Footprints move by their corners (so a quarter turn swaps the sides); a dimension line is its two end points.
        const a = f({ x: e.x, y: e.y }), b = f({ x: e.x + e.w, y: e.y + e.h });
        const { auto: _auto, ...rest } = e;
        const geo = e.item === 'dim' ? { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
        return { ...rest, ...geo, ...(mode === 'rotate' && e.item === 'device' ? { rot: ((((e.rot ?? 0) + 90) % 360) as Rot) } : {}) };
      }
      case 'circle':
      case 'table':
      case 'report':
      case 'form':
      case 'warning': { const np = f({ x: e.x, y: e.y }); return { ...e, x: np.x, y: np.y }; }
    }
  });
  // Rubber band: unselected wires ending on an old anchor follow it to the new anchor.
  const fixed = elements.map((e): El => {
    if (e.kind !== 'wire' || sel.has(e.id)) return e;
    let pts = e.points;
    for (const end of ['start', 'end'] as const) {
      const at = end === 'start' ? pts[0] : pts[pts.length - 1];
      const i = oldAnchors.findIndex((a) => samePt(a, at));
      if (i >= 0 && !samePt(oldAnchors[i], newAnchors[i])) pts = moveWireEnd(pts, end, newAnchors[i]);
    }
    return pts === e.points ? e : { ...e, points: pts };
  });
  return cleanupJunctions({ ...pg, elements: fixed });
}

const round25 = (v: number) => Math.round(v / 2.5) * 2.5;

/** The centre of the selection's anchor points, on the 2.5 mm grid. */
function centre(pg: Page, ids: string[]): Pt {
  const sel = new Set(ids);
  const xs: number[] = [], ys: number[] = [];
  for (const e of pg.elements) {
    if (!sel.has(e.id)) continue;
    if (e.kind === 'wire' || e.kind === 'line') for (const p of e.points) { xs.push(p.x); ys.push(p.y); }
    else if ('x' in e) { xs.push(e.x); ys.push(e.y); if (e.kind === 'rect' || e.kind === 'image' || e.kind === 'box' || e.kind === 'cab') { xs.push(e.x + e.w); ys.push(e.y + e.h); } }
  }
  if (xs.length === 0) return { x: 0, y: 0 };
  return { x: round25((Math.min(...xs) + Math.max(...xs)) / 2), y: round25((Math.min(...ys) + Math.max(...ys)) / 2) };
}

/** Renames a device everywhere: its symbols and boxes, assembly outlines, mating connectors and device data. */
function renameDevice(project: Project, oldKey: string, oldDes: string, newDes: string): Project {
  const pages = project.pages.map((pg) => {
    let changed = false;
    const elements = pg.elements.map((e) => {
      if ((e.kind === 'symbol' || e.kind === 'box') && e.designation && keyOf(pg, e.designation, e.location) === oldKey) {
        changed = true;
        return { ...e, designation: newDes };
      }
      if (e.kind === 'rect' && e.assembly && keyOf(pg, e.assembly) === oldKey) {
        changed = true;
        return { ...e, assembly: newDes };
      }
      if (e.kind === 'box' && e.mate === oldDes) {
        changed = true;
        return { ...e, mate: newDes };
      }
      return e;
    });
    return changed ? { ...pg, elements } : pg;
  });
  // The new key: the same aspects as the old one with the new product part.
  const asp = parseDesignation(oldKey);
  const newKey = fullDesignation(asp.function ?? '', asp.location ?? '', newDes);
  const taken = project.devices.some((r) => r.designation === newKey);
  const devices = project.devices
    .filter((r) => !(taken && r.designation === oldKey))
    .map((r) => {
      const designation = r.designation === oldKey ? newKey : r.designation;
      const parent = r.parent === oldKey ? newKey : r.parent;
      return designation === r.designation && parent === r.parent ? r : { ...r, designation, ...(parent !== undefined ? { parent } : {}) };
    });
  return { ...project, pages, devices: devices.sort((x, y) => x.designation.localeCompare(y.designation, 'en', { numeric: true })) };
}

function updateDevice(project: Project, key: string, patch: { parts?: PartUse[]; fields?: Record<string, string>; parent?: string | null; load?: LoadData | null }): Project {
  const rec: DeviceRec = project.devices.find((r) => r.designation === key) ?? { designation: key, parts: [], fields: {} };
  const fields = { ...rec.fields, ...(patch.fields ?? {}) };
  for (const k of Object.keys(fields)) if (fields[k] === '') delete fields[k];
  const parent = patch.parent === undefined ? rec.parent : patch.parent === null || patch.parent === key ? undefined : patch.parent;
  const load = patch.load === undefined ? rec.load : patch.load === null ? undefined : patch.load;
  const next: DeviceRec = { designation: key, ...(load ? { load } : {}), parts: patch.parts ?? rec.parts, fields, ...(parent ? { parent } : {}) };
  const others = project.devices.filter((r) => r.designation !== key);
  const empty = next.parts.length === 0 && Object.keys(next.fields).length === 0 && !next.parent && !next.load;
  const devices = empty ? others : [...others, next].sort((x, y) => x.designation.localeCompare(y.designation, 'en', { numeric: true }));
  return { ...project, devices };
}

/** A terminal placed without a strip joins the strip of the last terminal on the page (else -X1) and takes the next free number. */
function placeTerminal(project: Project, pg: Page, el: SymbolEl, lib: Library): SymbolEl {
  const strips = terminalStrips(project, lib);
  let designation = el.designation;
  if (!designation) {
    const onPage = strips.flatMap((s) => s.terminals).filter((t) => t.page === pg).sort((a, b) => b.pageIndex - a.pageIndex);
    designation = onPage[onPage.length - 1]?.designation ?? '-X1';
  }
  if (el.value) return { ...el, designation };
  const key = keyOf(pg, designation, el.location);
  const used = (strips.find((s) => s.key === key)?.terminals ?? []).map((t) => Number(t.no)).filter((n) => Number.isFinite(n));
  return { ...el, designation, value: String((used.length ? Math.max(...used) : 0) + 1) };
}

function renumberTerminals(project: Project, lib: Library): Project {
  const set = new Map<string, string>();
  for (const s of terminalStrips(project, lib)) {
    s.terminals.slice().sort((a, b) => a.pageIndex - b.pageIndex || a.el.x - b.el.x || a.el.y - b.el.y).forEach((t, i) => set.set(`${t.page.id}/${t.el.id}`, String(i + 1)));
  }
  let changed = false;
  const pages = project.pages.map((pg) => {
    let pc = false;
    const elements = pg.elements.map((e) => {
      const n = e.kind === 'symbol' ? set.get(`${pg.id}/${e.id}`) : undefined;
      if (n === undefined || (e as SymbolEl).value === n) return e;
      pc = true;
      return { ...(e as SymbolEl), value: n };
    });
    if (pc) changed = true;
    return pc ? { ...pg, elements } : pg;
  });
  return changed ? { ...project, pages } : project;
}

export function apply(project: Project, cmd: Command, ctx: Ctx): Project {
  const lib = withProjectSymbols(ctx.lib, project.symbols);
  switch (cmd.type) {
    case 'project/set':
      return {
        ...project,
        name: cmd.name ?? project.name,
        properties: cmd.properties ? { ...project.properties, ...cmd.properties } : project.properties,
        assembly: cmd.assembly ? { ...project.assembly, ...cmd.assembly } : project.assembly,
      };
    case 'project/settings': return { ...project, settings: { ...project.settings, ...cmd.settings } };
    case 'project/potentials': return { ...project, potentials: cmd.potentials };
    case 'template/upsert': {
      const i = project.templates.findIndex((t) => t.id === cmd.template.id);
      const templates = project.templates.slice();
      if (i >= 0) templates[i] = cmd.template;
      else templates.push(cmd.template);
      return { ...project, templates };
    }
    case 'template/remove':
      return project.templates.length <= 1 ? project : { ...project, templates: project.templates.filter((t) => t.id !== cmd.id) };
    case 'asset/add': return { ...project, assets: { ...project.assets, [cmd.id]: cmd.asset } };
    case 'symbol/embed': return project.symbols.some((s) => s.id === cmd.def.id) ? project : { ...project, symbols: [...project.symbols, cmd.def] };
    case 'page/add': {
      const pages = project.pages.slice();
      pages.splice(cmd.index ?? pages.length, 0, cmd.page);
      return { ...project, pages };
    }
    case 'page/remove': return { ...project, pages: project.pages.filter((p) => p.id !== cmd.id) };
    case 'page/move': {
      const from = project.pages.findIndex((p) => p.id === cmd.id);
      if (from < 0) return project;
      const pages = project.pages.slice();
      const [pg] = pages.splice(from, 1);
      pages.splice(Math.max(0, Math.min(pages.length, cmd.index)), 0, pg);
      return { ...project, pages };
    }
    case 'page/update': return mapPage(project, cmd.id, (pg) => ({ ...pg, ...cmd.patch }));
    case 'el/add': return mapPage(project, cmd.page, (pg) => ({ ...pg, elements: [...pg.elements, ...cmd.elements] }));
    case 'el/update': {
      // A layout item edited by hand is no longer the suggestion's: it stays put when the layout is suggested again.
      const updated = mapPage(project, cmd.page, (pg) => ({ ...pg, elements: pg.elements.map((e) => (e.id === cmd.id ? ({ ...e, ...(e.kind === 'cab' && !('auto' in cmd.patch) ? { auto: undefined } : {}), ...cmd.patch, id: e.id, kind: e.kind } as El) : e)) }));
      // Changing the designation of a device's symbol renames the device: every representation follows.
      const pg = project.pages.find((p) => p.id === cmd.page);
      const old = pg?.elements.find((e) => e.id === cmd.id);
      const des = cmd.patch.designation;
      if (pg && old && (old.kind === 'symbol' || old.kind === 'box') && old.designation && typeof des === 'string' && des !== old.designation && !('location' in cmd.patch)) return renameDevice(updated, keyOf(pg, old.designation, old.location), old.designation, des);
      return updated;
    }
    case 'device/relink': return mapPage(project, cmd.page, (pg) => ({ ...pg, elements: pg.elements.map((e) => ((e.kind === 'symbol' || e.kind === 'box') && e.id === cmd.id ? { ...e, designation: cmd.designation } : e)) }));
    case 'box/place':
      return mapPage(project, cmd.page, (pg) => {
        let el = cmd.element;
        if (cmd.autoNumber && !el.designation) el = { ...el, designation: nextDesignation(project, pg, el.variant === 'connector' ? 'X' : 'A', el.location) };
        return { ...pg, elements: [...pg.elements, el] };
      });
    case 'device/update': return updateDevice(project, cmd.key, cmd.patch);
    case 'part/dims': {
      const own = project.parts.find((p) => p.id === cmd.id);
      const def = own ?? lib.parts.get(cmd.id);
      if (!def) return project;
      const next: PartDef = { ...def, dimensions: { ...cmd.dims } };
      return { ...project, parts: own ? project.parts.map((p) => (p.id === cmd.id ? next : p)) : [...project.parts, next] };
    }
    case 'part/embed': return project.parts.some((p) => p.id === cmd.def.id) ? project : { ...project, parts: [...project.parts, cmd.def] };
    case 'projectPart/set': {
      const i = project.projectParts.findIndex((p) => p.id === cmd.part.id);
      const projectParts = project.projectParts.slice();
      if (i >= 0) projectParts[i] = cmd.part;
      else projectParts.push(cmd.part);
      return { ...project, projectParts };
    }
    case 'projectPart/remove': return { ...project, projectParts: project.projectParts.filter((p) => p.id !== cmd.id) };
    case 'assembly/create': {
      const pg = project.pages.find((p) => p.id === cmd.page);
      if (!pg || !cmd.rect.assembly) return project;
      const key = keyOf(pg, cmd.rect.assembly);
      let next = mapPage(project, cmd.page, (p) => ({ ...p, elements: [...p.elements, { ...cmd.rect, dashed: true }] }));
      for (const child of cmd.children) if (child !== key) next = updateDevice(next, child, { parent: key });
      return next;
    }
    case 'macro/place':
      return mapPage(project, cmd.page, (pg) => {
        const added = placeMacro(project, pg, cmd.macro, { x: cmd.x, y: cmd.y }, cmd.prefix);
        let next: Page = { ...pg, elements: [...pg.elements, ...added] };
        for (const w of added) if (w.kind === 'wire') next = addJunctions(next, w);
        return next;
      });
    case 'el/remove': {
      const rm = new Set(cmd.ids);
      return mapPage(project, cmd.page, (pg) => cleanupJunctions({ ...pg, elements: pg.elements.filter((e) => !rm.has(e.id)) }));
    }
    case 'el/move':
      return mapPage(project, cmd.page, (pg) => transform(pg, cmd.ids, (p) => ({ x: p.x + cmd.dx, y: p.y + cmd.dy }), 'move', lib));
    case 'el/rotate':
      return mapPage(project, cmd.page, (pg) => {
        const c = centre(pg, cmd.ids);
        // 90 degrees clockwise on screen (y down): (x, y) -> (cx - (y - cy), cy + (x - cx)).
        return transform(pg, cmd.ids, (p) => ({ x: c.x - (p.y - c.y), y: c.y + (p.x - c.x) }), 'rotate', lib);
      });
    case 'el/mirror':
      return mapPage(project, cmd.page, (pg) => {
        const c = centre(pg, cmd.ids);
        return transform(pg, cmd.ids, (p) => ({ x: 2 * c.x - p.x, y: p.y }), 'mirror', lib);
      });
    case 'symbol/place':
      return mapPage(project, cmd.page, (pg) => {
        let el = cmd.element;
        const letters = lib.symbols.get(el.symbolId)?.designationLetter;
        const auto = lib.symbols.get(el.symbolId)?.autoNumber !== false;
        if (cmd.autoNumber && !el.designation && letters && auto) el = { ...el, designation: nextDesignation(project, pg, letters, el.location) };
        if (cmd.autoNumber && lib.symbols.get(el.symbolId)?.function === 'terminal') el = placeTerminal(project, pg, el, lib);
        return { ...pg, elements: [...pg.elements, el] };
      });
    case 'wire/add':
      return mapPage(project, cmd.page, (pg) => {
        const points = normalizePoints(cmd.points);
        if (points.length < 2) return pg;
        const wire: WireEl = { id: cmd.id, kind: 'wire', points, ...(cmd.potential ? { potential: cmd.potential } : {}), ...(cmd.conductors && cmd.conductors > 1 ? { conductors: cmd.conductors } : {}) };
        const next = { ...pg, elements: [...pg.elements, wire] };
        return addJunctions(next, wire);
      });
    case 'designation/renumber': return renumber(project, lib, cmd.page);
    case 'wire/renumber': return renumberWires(project, ctx.lib, cmd.page);
    case 'terminal/renumber': return renumberTerminals(project, ctx.lib);
    case 'project/wires': return { ...project, wireClasses: cmd.wireClasses ?? project.wireClasses, wireTypes: cmd.wireTypes ?? project.wireTypes };
    case 'cable/set': {
      const i = project.cables.findIndex((c) => c.id === cmd.cable.id);
      const cables = project.cables.slice();
      if (i >= 0) cables[i] = cmd.cable;
      else cables.push(cmd.cable);
      return { ...project, cables: cables.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })) };
    }
    case 'cable/remove': return { ...project, cables: project.cables.filter((c) => c.id !== cmd.id) };
    case 'issue/status': return project.issueStatus === cmd.status ? project : { ...project, issueStatus: cmd.status };
    case 'revision/issue': {
      const r = cmd.revision;
      const props = { ...project.properties, revision: r.number, issueDate: r.date, ...(r.drawn ? { drawn: r.drawn } : {}), ...(r.checked ? { checked: r.checked } : {}), ...(r.approved ? { approved: r.approved } : {}) };
      return { ...project, issueStatus: r.status, properties: props, revisions: [...project.revisions, { ...r, ...makeSnapshot(project, ctx.lib) }] };
    }
    case 'plc/channels': return applyChannelEdits(project, cmd.edits);
    case 'plc/assign': return applyChannelEdits(project, assignEdits(project, !!cmd.all));
    case 'layer/set': {
      const rest = (project.layers ?? []).filter((l) => l.id !== cmd.layer.id);
      const at = (project.layers ?? []).findIndex((l) => l.id === cmd.layer.id);
      const next = at < 0 ? [...rest, cmd.layer] : [...rest.slice(0, at), cmd.layer, ...rest.slice(at)];
      return { ...project, layers: next };
    }
    case 'layer/remove': {
      const layers = (project.layers ?? []).filter((l) => l.id !== cmd.id);
      const pages = project.pages.map((pg) => (pg.elements.some((e) => e.layer === cmd.id) ? { ...pg, elements: pg.elements.map((e) => (e.layer === cmd.id ? ({ ...e, layer: undefined } as El) : e)) } : pg));
      return { ...project, layers, pages };
    }
    case 'batch': return cmd.commands.reduce((p, c) => apply(p, c, ctx), project);
  }
}
