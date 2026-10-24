// The cabinet layout (M6 part 3): placement and snapping, the suggestion and its rules, locks, templates,
// exchange round trips, duct fill and wire lengths. Built on the sample projects (generic parts only).
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '@shared/commands';
import { computeBom } from '@shared/bom';
import { cabinetOf, isCab } from '@shared/cabinet/model';
import { alignCommands, distributeCommands, moveCommand, snapToRail, unplacedDevices } from '@shared/cabinet/place';
import { suggestLayout } from '@shared/cabinet/suggest';
import { cabinetDevices, wireDiameter } from '@shared/cabinet/size';
import { layoutIssues } from '@shared/cabinet/check';
import { ductFills } from '@shared/cabinet/fill';
import { cableLength, routerOf } from '@shared/cabinet/route';
import { applyPlan, exportLayout, layoutCsv, layoutJson, parseLayoutCsv, parseLayoutJson, planDimsImport, planLayoutImport } from '@shared/cabinet/exchange';
import { drillHoles, drillingDxf, layoutPageDxf } from '@shared/cabinet/dxf';
import { isTemplate, loadTemplate, templateFromLayout } from '@shared/cabinet/templates';
import { layoutScale } from '@shared/cabinet/draw';
import { buildPage } from '@shared/draw/page';
import { wireRows } from '@shared/reports';
import { parseCsv } from '@shared/export/csv';
import { idGen } from '@shared/ids';
import type { CabEl, Project } from '@shared/model/types';
import { newProject } from '@shared/model/defaults';
import { exportPdf } from '@shared/pdf';
import { PDFDocument } from 'pdf-lib';
import { readDxf } from '@shared/export/dxf';
import { chargerSample, conveyorSample, pumpSample } from './support/samples';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const pump = pumpSample(lib);
const charger = chargerSample(lib);
const conveyor = conveyorSample(lib);
const run = (p: Project, cmds: Command[]): Project => apply(p, { type: 'batch', label: 'x', commands: cmds }, { lib });
const devsOf = (p: Project) => cabinetOf(p).devices;
const bare = (p: Project): Project => ({ ...p, pages: p.pages.filter((pg) => !(pg.type === 'layout' && pg.layout)) });

describe('the samples ship with a suggested cabinet layout', () => {
  for (const [name, p] of [['pump station', pump], ['dc charger', charger], ['conveyor', conveyor]] as const) {
    it(`${name}: every cabinet device is placed and nothing collides`, () => {
      const cab = cabinetOf(p);
      expect(cab.enclosure && cab.plate).toBeTruthy();
      expect(unplacedDevices(p, lib).map((d) => d.key)).toEqual([]);
      expect(layoutIssues(p, lib)).toEqual([]);
      expect(cab.sides.length).toBe(1);
    });
  }
  it('the charger has door devices on a door page and its layout needs the larger enclosure', () => {
    const cab = cabinetOf(charger);
    expect(cab.doors.length).toBe(1);
    expect(cab.devices.filter((d) => cab.doors.includes(d.page)).length).toBeGreaterThanOrEqual(3);
    expect(cab.enclosure!.w).toBeGreaterThan(800);
  });
});

describe('device sizes and the "not yet placed" list', () => {
  it('lists cabinet devices only (motors and sensors are field devices) with their body from the part', () => {
    const devs = cabinetDevices(bare(pump), lib);
    expect(devs.length).toBeGreaterThan(10);
    expect(devs.some((d) => d.key.endsWith('-M1'))).toBe(false);
    const km = devs.find((d) => d.key.endsWith('-KM1'))!;
    expect(km.mount).toBe('rail');
    expect(km.w).toBe(km.part!.dimensions!.w);
  });
  it('a terminal strip is as wide as its terminals', () => {
    const x1 = cabinetDevices(bare(pump), lib).find((d) => d.key.endsWith('-X1'))!;
    expect(x1.terminals).toBeGreaterThan(0);
    expect(x1.w).toBeCloseTo(x1.terminals * x1.part!.dimensions!.w + 16, 5);
  });
  it('everything is unplaced before a layout exists, and nothing after', () => {
    expect(unplacedDevices(bare(pump), lib).length).toBe(cabinetDevices(bare(pump), lib).length);
    expect(unplacedDevices(pump, lib)).toEqual([]);
  });
  it('wire outer diameter grows with the cross-section', () => {
    expect(wireDiameter(1.5)).toBeLessThan(wireDiameter(2.5));
    expect(wireDiameter(2.5)).toBeLessThan(wireDiameter(16));
    expect(wireDiameter(NaN)).toBeGreaterThan(0);
  });
});

describe('snap to rail, align and distribute', () => {
  const rail: CabEl = { id: 'r', kind: 'cab', item: 'rail', x: 100, y: 200, w: 400, h: 35 };
  const dev = (id: string, x: number, y: number, w = 45, h = 90): CabEl => ({ id, kind: 'cab', item: 'device', x, y, w, h, designation: `-${id}` });
  it('puts a device near the rail onto it: centred on the rail line, inside its length', () => {
    const s = snapToRail(dev('a', 90, 190), [rail], []);
    expect(s).toEqual({ x: 100, y: 217.5 - 45, rail: 'r' });
  });
  it('slides to the nearest free spot beside a neighbour', () => {
    const s = snapToRail(dev('b', 120, 172), [rail], [dev('a', 100, 172.5)], 5);
    expect(s!.x).toBe(150);
  });
  it('does nothing for a device far from every rail or off its length', () => {
    expect(snapToRail(dev('c', 120, 600), [rail], [])).toBeNull();
    expect(snapToRail(dev('d', 700, 172), [rail], [])).toBeNull();
  });
  it('dropping a rail device near a rail snaps it, and moving a rail takes its devices along', () => {
    const p = pump;
    const cab = cabinetOf(p);
    const railEl = cab.rails[0].el;
    const onRail = cab.devices.filter((d) => d.el.rail === railEl.id);
    expect(onRail.length).toBeGreaterThan(2);
    const cmd = moveCommand(p, lib, cab.front!.id, [railEl.id], 0, 30);
    const q = run(p, [cmd]);
    for (const d of onRail) expect(cabinetOf(q).devices.find((x) => x.el.id === d.el.id)!.el.y).toBeCloseTo(d.el.y + 30, 5);
    // A device dragged a little off its rail snaps back onto the centre line.
    const one = onRail[0].el;
    const q2 = run(p, [moveCommand(p, lib, cab.front!.id, [one.id], 0, 12)]);
    expect(cabinetOf(q2).devices.find((x) => x.el.id === one.id)!.el.y).toBeCloseTo(one.y, 5);
  });
  it('aligns to the first selected and distributes with equal gaps', () => {
    const page = { id: 'pg', type: 'layout', title: {}, size: 'A3', templateId: '', elements: [dev('a', 100, 100), dev('b', 190, 140), dev('c', 400, 90, 60, 70), dev('d', 305, 100)] } as never;
    const al = alignCommands(page, ['a', 'b', 'c'], 'top');
    expect(al.map((c) => (c as unknown as { patch: { y: number } }).patch.y)).toEqual([100, 100]);
    const dist = distributeCommands(page, ['a', 'd', 'c', 'b'], 'h');
    // a(100..145) b(190..235) d(305..350) c(400..460): gaps (460-100-195)/3 = 55 -> b at 200, d at 300
    expect(dist.map((c) => (c as unknown as { id: string; patch: { x: number } }).patch.x)).toEqual([200, 300]);
  });
});

describe('the suggested layout', () => {
  const sug = suggestLayout(bare(pump), lib, { newId: idGen('t') });
  const q = run(bare(pump), sug.commands);
  it('places every device, on a plate that fits, with the rules it applied and their sources', () => {
    expect(sug.fits).toBe(true);
    expect(sug.issues).toEqual([]);
    expect(unplacedDevices(q, lib)).toEqual([]);
    expect(sug.rules.length).toBeGreaterThanOrEqual(6);
    for (const r of sug.rules) expect(['project', 'standard', 'library', 'suggestion']).toContain(r.source.kind);
    expect(sug.rules.some((r) => r.source.kind === 'standard' && r.source.ref === 'IEC 60715')).toBe(true);
    expect(layoutIssues(q, lib)).toEqual([]);
  });
  it('puts power devices above control devices and terminals below them, groups by schematic order', () => {
    const cab = cabinetOf(q);
    const byKey = new Map(cabinetDevices(q, lib).map((d) => [d.key, d]));
    const ys = (g: string) => cab.devices.filter((d) => byKey.get(d.el.designation as string)?.group === g).map((d) => d.el.y);
    expect(Math.max(...ys('power'))).toBeLessThan(Math.min(...ys('control')));
    expect(Math.max(...ys('control'))).toBeLessThan(Math.min(...ys('terminals')));
    // Within the first power row the devices follow the schematic order.
    const first = cab.devices.filter((d) => byKey.get(d.el.designation as string)?.group === 'power' && d.el.y === Math.min(...ys('power'))).sort((a, b) => a.el.x - b.el.x);
    const order = first.map((d) => byKey.get(d.el.designation as string)!.order);
    expect(order).toEqual(order.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]));
  });
  it('keeps rows on a DIN rail, with ducts above and below and the fill under the limit', () => {
    const cab = cabinetOf(q);
    expect(cab.rails.length).toBeGreaterThanOrEqual(3);
    expect(cab.ducts.length).toBeGreaterThanOrEqual(4);
    for (const f of ductFills(q, lib)) expect(f.pct).toBeLessThanOrEqual(f.max);
    for (const d of cab.devices.filter((x) => x.el.rail)) {
      const r = cab.rails.find((x) => x.el.id === d.el.rail)!.el;
      expect(d.el.y + d.el.h / 2).toBeCloseTo(r.y + r.h / 2, 5);
    }
  });
  it('is deterministic and a second suggestion has nothing left to do', () => {
    const again = suggestLayout(bare(pump), lib, { newId: idGen('t') });
    expect(JSON.stringify(again.commands)).toBe(JSON.stringify(sug.commands));
    const third = suggestLayout(q, lib, { newId: idGen('u') });
    const q3 = run(q, third.commands);
    expect(devsOf(q3).map((d) => [d.el.designation, d.el.x, d.el.y]).sort()).toEqual(devsOf(q).map((d) => [d.el.designation, d.el.x, d.el.y]).sort());
  });
  it('sizes the spare space: more spare asks for a larger enclosure', () => {
    const tight = suggestLayout({ ...bare(pump), settings: { ...pump.settings, layout: { ...pump.settings.layout, sparePct: 0 } } }, lib, { newId: idGen('a') });
    const roomy = suggestLayout({ ...bare(pump), settings: { ...pump.settings, layout: { ...pump.settings.layout, sparePct: 300 } } }, lib, { newId: idGen('b') });
    const w = (s: typeof sug) => { const e = (s.commands.find((c) => c.type === 'el/add') as { elements: CabEl[] }).elements.find((x) => x.item === 'enclosure')!; return e.w * e.h; };
    expect(w(roomy)).toBeGreaterThan(w(tight));
  });
  it('moved or locked items stay put when the layout is suggested again, and the rest is arranged around them', () => {
    const cab = cabinetOf(q);
    const km = cab.devices.find((d) => d.el.designation!.endsWith('-KM1'))!;
    const kt = cab.devices.find((d) => d.el.designation!.endsWith('-KT1'))!;
    // KM1 is moved by hand (auto is cleared by the edit), KT1 is locked in place.
    const edited = run(q, [
      { type: 'el/update', page: km.page.id, id: km.el.id, patch: { x: km.el.x, y: km.el.y + 0.5 } },
      { type: 'el/update', page: kt.page.id, id: kt.el.id, patch: { locked: true, auto: true } },
    ]);
    expect(cabinetOf(edited).devices.find((d) => d.el.id === km.el.id)!.el.auto).toBeUndefined();
    const again = suggestLayout(edited, lib, { newId: idGen('z') });
    expect(again.kept).toBeGreaterThanOrEqual(2);
    const q2 = run(edited, again.commands);
    const at = (p: Project, key: string) => devsOf(p).filter((d) => d.el.designation === key).map((d) => [d.el.x, d.el.y]);
    expect(at(q2, km.el.designation!)).toEqual([[km.el.x, km.el.y + 0.5]]);
    expect(at(q2, kt.el.designation!)).toEqual([[kt.el.x, kt.el.y]]);
    expect(unplacedDevices(q2, lib)).toEqual([]);
    expect(layoutIssues(q2, lib)).toEqual([]);
  });
  it('respects a no-mount zone the user drew', () => {
    const zone: CabEl = { id: 'z1', kind: 'cab', item: 'zone', x: 160, y: 190, w: 200, h: 200 };
    const base = bare(pump);
    const withFront = run(base, suggestLayout(base, lib, { newId: idGen('f') }).commands);
    const cab = cabinetOf(withFront);
    // A zone drawn on the left part of the plate: the devices are arranged without touching it.
    const z = { ...zone, x: cab.plate!.x + 90, y: cab.plate!.y + 15, w: 150, h: 220 };
    const edited = run(withFront, [{ type: 'el/add', page: cab.front!.id, elements: [z] }]);
    const again = run(edited, suggestLayout(edited, lib, { newId: idGen('g') }).commands);
    expect(layoutIssues(again, lib).filter((i) => i.kind === 'zone')).toEqual([]);
    expect(unplacedDevices(again, lib)).toEqual([]);
  });
  it('the fake assistant suggests a layout and moves the PLC then rearranges, both as previews', async () => {
    const { fakeAnswer } = await import('@shared/ai/fake');
    const a = fakeAnswer({ prompt: 'suggest a layout', lang: 'en', project: bare(pump), pageId: bare(pump).pages[0].id, selection: [] }, lib, idGen('ai'));
    expect(a.proposal?.commands.length).toBe(1);
    expect(a.claims.length).toBeGreaterThan(4);
    const accepted = run(bare(pump), a.proposal!.commands);
    expect(unplacedDevices(accepted, lib)).toEqual([]);
    const m = fakeAnswer({ prompt: 'move the PLC to the right and rearrange', lang: 'en', project: accepted, pageId: cabinetOf(accepted).front!.id, selection: [] }, lib, idGen('ai2'));
    expect(m.proposal).toBeTruthy();
    const moved = run(accepted, m.proposal!.commands);
    const plc = cabinetOf(moved).devices.find((d) => d.el.designation!.endsWith('-A1'))!;
    const rail = cabinetOf(moved).rails.find((r) => r.el.id === plc.el.rail)!.el;
    expect(plc.el.x + plc.el.w).toBeCloseTo(rail.x + rail.w, 5);
    expect(layoutIssues(moved, lib)).toEqual([]);
  });
});

describe('templates', () => {
  it('saves a layout as a template and loads it into a new project, filling the slots', () => {
    const tpl = templateFromLayout(pump, lib, 'company-pump', 'Pump cabinet')!;
    expect(isTemplate(JSON.parse(JSON.stringify(tpl)))).toBe(true);
    expect(tpl.slots.length).toBeGreaterThan(5);
    expect(tpl.enclosure.w).toBe(cabinetOf(pump).enclosure!.w);
    // The same devices, no layout yet: the template puts the structure and the matching devices on it.
    const fresh = bare(pump);
    const load = loadTemplate(fresh, lib, tpl, idGen('tp'));
    expect(load.warnings).toEqual([]);
    expect(load.filled).toBeGreaterThan(5);
    const q = run(fresh, load.commands);
    const cab = cabinetOf(q);
    expect(cab.enclosure!.w).toBe(tpl.enclosure.w);
    expect(cab.rails.length).toBe(tpl.items.filter((i) => i.item === 'rail').length);
    expect(cab.devices.length).toBe(load.filled);
    // Slot devices sit on the template's rails; the rest is arranged by the suggestion around them.
    const rest = run(q, suggestLayout(q, lib, { newId: idGen('tq') }).commands);
    expect(unplacedDevices(rest, lib)).toEqual([]);
    expect(layoutIssues(rest, lib)).toEqual([]);
  });
  it('does not load into a project that already has a layout', () => {
    const tpl = templateFromLayout(pump, lib, 'x', 'x')!;
    expect(loadTemplate(pump, lib, tpl).warnings.length).toBe(1);
  });
});

describe('exchange: JSON, CSV, DXF and the ERP item master', () => {
  it('JSON round trip: exporting and importing the same layout changes nothing', () => {
    const f = exportLayout(pump, lib);
    expect(f.format).toBe('cablepilot-layout');
    expect(f.version).toBe(1);
    const parsed = parseLayoutJson(layoutJson(f));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.items).toEqual(f.items);
    const plan = planLayoutImport(pump, lib, parsed.value, idGen('im'));
    expect(plan.changes).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.unchanged).toBeGreaterThan(10);
    expect(plan.commands).toEqual([]);
  });
  it('rows have designation, part code, enclosure, mount, rail, x, y, z, rotation and size, relative to the plate', () => {
    const f = exportLayout(charger, lib);
    const cab = cabinetOf(charger);
    const dev = f.items.find((i) => i.type === 'device' && i.mount === 'plate')!;
    expect(dev.partCode).toMatch(/^GEN-/);
    expect(dev.enclosure).toBe(cab.enclosure!.designation);
    const el = cab.devices.find((d) => d.el.designation === dev.designation)!.el;
    expect(dev.x).toBeCloseTo(el.x - cab.plate!.x, 5);
    const door = f.items.find((i) => i.mount === 'door')!;
    expect(door.z).toBeCloseTo(cab.enclosure!.d! - (cab.plate!.d ?? 0), 5);
    expect(['designation', 'partCode', 'enclosure', 'mount', 'rail', 'x', 'y', 'z', 'rotation', 'width', 'height', 'depth'].every((k) => k in dev)).toBe(true);
  });
  it('CSV round trip in English and Italian', () => {
    const f = exportLayout(pump, lib);
    for (const lang of ['en', 'it'] as const) {
      const csv = layoutCsv(f, lang);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const back = parseLayoutCsv(parseCsv(csv));
      expect(back.ok && back.value.items).toEqual(f.items);
    }
  });
  it('an import is previewed as commands, moves a device, and is undone in one step', () => {
    const f = exportLayout(pump, lib);
    const dev = f.items.find((i) => i.type === 'device' && !i.locked)!;
    const edited = { ...f, items: f.items.map((i) => (i === dev ? { ...i, x: i.x + 40 } : i)) };
    const plan = planLayoutImport(pump, lib, edited, idGen('im2'));
    expect(plan.moved).toBe(1);
    expect(plan.changes.length).toBe(1);
    const after = applyPlan(pump, lib, plan);
    const el = (p: Project) => cabinetOf(p).devices.find((d) => d.el.designation === dev.designation)!.el;
    expect(el(after).x).toBeCloseTo(el(pump).x + 40, 5);
    expect(el(after).auto).toBeUndefined();
  });
  it('builds a layout from a file into a project with none, and refuses devices that are not in the schematic', () => {
    const f = exportLayout(pump, lib);
    const withGhost = { ...f, items: [...f.items, { ...f.items.find((i) => i.type === 'device')!, designation: '-K99' }] };
    const plan = planLayoutImport(bare(pump), lib, withGhost, idGen('im3'));
    expect(plan.warnings.some((w) => w.includes('-K99'))).toBe(true);
    const q = applyPlan(bare(pump), lib, plan);
    expect(unplacedDevices(q, lib)).toEqual([]);
    expect(cabinetOf(q).enclosure!.w).toBe(cabinetOf(pump).enclosure!.w);
    // The same layout again changes nothing.
    expect(planLayoutImport(q, lib, parseLayoutJson(layoutJson(exportLayout(q, lib))).ok ? (parseLayoutJson(layoutJson(exportLayout(q, lib))) as { ok: true; value: never }).value : f, idGen('x')).commands).toEqual([]);
  });
  it('rejects files that are not layouts, newer versions and bad rows in plain language', () => {
    expect(parseLayoutJson('{"format":"other"}')).toMatchObject({ ok: false, error: { code: 'layout.format' } });
    expect(parseLayoutJson('{"format":"cablepilot-layout","version":99,"items":[]}')).toMatchObject({ ok: false, error: { code: 'layout.version' } });
    expect(parseLayoutJson('nope')).toMatchObject({ ok: false, error: { code: 'layout.json' } });
    expect(parseLayoutCsv([['a', 'b']])).toMatchObject({ ok: false, error: { code: 'layout.csv' } });
    expect(parseLayoutCsv([['type', 'x', 'y', 'width', 'height'], ['spaceship', '1', '2', '3', '4']])).toMatchObject({ ok: false, error: { code: 'layout.row' } });
  });
  it('DXF of the 2D views has one layer per kind of item, at real size', () => {
    const cab = cabinetOf(pump);
    const dxf = layoutPageDxf(pump, cab.front!, lib);
    for (const l of ['ENCLOSURE', 'PLATE', 'RAILS', 'DUCTS', 'DEVICES', 'DIMENSIONS']) expect(dxf).toContain(`\r\n${l}\r\n`);
    expect(dxf).toContain(`\r\n${cab.enclosure!.w}`);
    expect(layoutPageDxf(pump, cabinetOf(pump).sides[0], lib)).toContain('SIDEVIEW');
  });
  it('DXF round trip: the views read back as shapes at the real size of the enclosure and plate', () => {
    const cab = cabinetOf(pump);
    const read = readDxf(layoutPageDxf(pump, cab.front!, lib));
    const boxes = read.shapes.filter((s) => s.pts && s.pts.length >= 4).map((s) => { const xs = s.pts!.map((p) => p.x), ys = s.pts!.map((p) => p.y); return [Math.round(Math.max(...xs) - Math.min(...xs)), Math.round(Math.max(...ys) - Math.min(...ys))]; });
    expect(boxes).toContainEqual([cab.enclosure!.w, cab.enclosure!.h]);
    expect(boxes).toContainEqual([cab.plate!.w, cab.plate!.h]);
    expect(read.shapes.filter((s) => s.text).length).toBeGreaterThan(10);
  });
  it('the drilling DXF has the plate outline and a circle for every fixing hole', () => {
    const holes = drillHoles(charger, lib);
    expect(holes.filter((h) => h.kind === 'rail').length).toBeGreaterThan(4);
    expect(holes.some((h) => h.kind === 'device')).toBe(true);
    const dxf = drillingDxf(charger, lib);
    expect(dxf.split('\r\nCIRCLE\r\n').length - 1).toBe(holes.length);
    expect(dxf).toContain('\r\nPLATE\r\n');
    for (const h of holes) { expect(h.x).toBeGreaterThan(0); expect(h.x).toBeLessThan(cabinetOf(charger).plate!.w); }
  });
  it('device and enclosure sizes from an ERP item master through the column mapping', () => {
    const rows = [['Item', 'Breite', 'Hoehe', 'Tiefe'], ['GEN-CONTACTOR-9A', '50', '95', '90'], ['GEN-ENCLOSURE-800X1000X300', '800', '1000', '320'], ['NOT-OURS', '1', '2', '3'], ['GEN-CONTACTOR-12A', 'x', '1', '2']];
    const mapping = { header: true, columns: { code: 'Item', width: 'Breite', height: 'Hoehe', depth: 'Tiefe' } } as const;
    const plan = planDimsImport(pump, lib, rows, mapping);
    expect(plan.mapped).toBe(true);
    expect(plan.unmatched).toEqual(['NOT-OURS']);
    expect(plan.skipped).toBe(1);
    const q = run(pump, plan.commands);
    expect(q.parts.find((p) => p.id === 'generic-contactor-9a')!.dimensions).toEqual({ w: 50, h: 95, d: 90 });
    // The contactors on the layout take the new size.
    const km = cabinetOf(q).devices.filter((d) => d.el.designation!.match(/-KM[1-6]$/) && cabinetDevices(q, lib).find((x) => x.key === d.el.designation)?.part?.id === 'generic-contactor-9a');
    for (const d of km) expect([d.el.w, d.el.h, d.el.d]).toEqual([50, 95, 90]);
    expect(planDimsImport(pump, lib, rows, { header: true, columns: { code: 'Item' } }).mapped).toBe(false);
  });
});

describe('wire lengths along the ducts and duct fill', () => {
  it('the wire list gets an estimated length (marked ~) and a typed length always wins', () => {
    const rows = wireRows(pump, lib);
    const est = rows.filter((r) => r[7].startsWith('~'));
    expect(est.length).toBeGreaterThan(10);
    for (const r of est) expect(Number(r[7].slice(1))).toBeGreaterThan(0.1);
    // Without a layout there is no estimate.
    expect(wireRows(bare(pump), lib).every((r) => r[7] === '')).toBe(true);
    // A typed length on the wire replaces the estimate in its row.
    const number = est[0][0];
    const typed: Project = { ...pump, pages: pump.pages.map((pg) => ({ ...pg, elements: pg.elements.map((e) => (e.kind === 'wire' && e.number === number ? { ...e, length: '9.9' } : e)) })) };
    expect(wireRows(typed, lib).find((r) => r[0] === number)![7]).toBe('9.9');
  });
  it('a route is longer when the devices are farther apart, and follows the ducts', () => {
    const r = routerOf(pump)!;
    const keys = devsOf(pump).map((d) => d.el.designation as string);
    const km1 = keys.find((k) => k.endsWith('-KM1'))!, qf1 = keys.find((k) => k.endsWith('-QF1'))!, x2 = keys.find((k) => k.endsWith('-X2'))!;
    const near = r.route(qf1, km1)!, far = r.route(qf1, x2)!;
    expect(far.mm).toBeGreaterThan(near.mm);
    expect(near.mm).toBeGreaterThanOrEqual(2 * pump.settings.layout.slack);
    expect(far.ducts.length).toBeGreaterThanOrEqual(1);
    expect(r.route(qf1, qf1)).toBeNull();
  });
  it('the duct fill rate counts the wires routed through each duct against the limit', () => {
    const fills = ductFills(pump, lib);
    expect(fills.length).toBeGreaterThanOrEqual(4);
    const used = fills.filter((f) => f.wires > 0);
    expect(used.length).toBeGreaterThan(0);
    for (const f of used) { expect(f.usedMm2).toBeGreaterThan(0); expect(f.pct).toBeGreaterThan(0); expect(f.max).toBe(50); }
    // A tighter limit marks the busiest duct as over.
    const tight = { ...pump, settings: { ...pump.settings, layout: { ...pump.settings.layout, ductFillMax: 0.5 } } };
    expect(ductFills(tight, lib).some((f) => f.over)).toBe(true);
    expect(layoutIssues(tight, lib).some((i) => i.kind === 'duct')).toBe(true);
  });
  it('cable metres for the warehouse come from the layout when the cable has no typed length', () => {
    const cable = { id: '-W9', kind: 'patch' as const, part: 'generic-cable-patch-rj45-cat5e', from: '-A1', to: '-A2' };
    const keys = devsOf(charger).map((d) => d.el.designation as string);
    const a = keys.find((k) => k.endsWith('-A1')), b = keys.find((k) => k.endsWith('-A2'));
    expect(a && b).toBeTruthy();
    const withCable: Project = { ...charger, cables: [...charger.cables.filter((c) => c.id !== '-W9'), cable] };
    const est = cableLength(withCable, lib, cable)!;
    expect(est.source).toBe('layout');
    expect(est.m).toBeGreaterThan(0.1);
    const bom = computeBom(withCable, lib);
    expect(bom.rows.find((r) => r.designation === '-W9')!.metres).toBeCloseTo(est.m * withCable.settings.bom.units, 5);
    // A typed length overrides it.
    const typed = { ...cable, length: '3' };
    const withTyped: Project = { ...withCable, cables: withCable.cables.map((c) => (c.id === '-W9' ? typed : c)) };
    expect(cableLength(withTyped, lib, typed)).toEqual({ m: 3, source: 'manual' });
    expect(computeBom(withTyped, lib).rows.find((r) => r.designation === '-W9')!.metres).toBe(3 * withTyped.settings.bom.units);
  });
});

describe('layout pages on the sheet', () => {
  it('draw to a standard scale with the caption, and the sheet carries the dimensions', () => {
    const cab = cabinetOf(pump);
    expect([1, 2, 5, 10, 20, 50, 100]).toContain(layoutScale(pump, cab.front!));
    const built = buildPage(pump, cab.front!, lib, pump.pages.indexOf(cab.front!));
    const texts = built.prims.filter((p) => p.k === 'text').map((p) => (p as { text: string }).text);
    expect(texts.some((t) => t.includes('1:'))).toBe(true);
    expect(texts.some((t) => t.includes(String(Math.round(cab.enclosure!.w))))).toBe(true);
    const edit = buildPage(pump, cab.front!, lib, 0, 'edit');
    expect(edit.width).toBe(cab.front!.layout!.w);
  });
  it('the side view shows the device depths and the layout is in the PDF set', async () => {
    const cab = cabinetOf(pump);
    const side = buildPage(pump, cab.sides[0], lib, 0);
    const texts = side.prims.filter((p) => p.k === 'text').map((p) => (p as { text: string }).text);
    const deepest = Math.max(...cab.devices.map((d) => d.el.d ?? 0));
    expect(texts).toContain(String(Math.round(deepest)));
    expect(texts).toContain(String(Math.round(cab.enclosure!.d!)));
    const ids = pump.pages.filter((p) => p.type === 'layout').map((p) => p.id);
    const pdf = await PDFDocument.load(await exportPdf(pump, lib, { pageIds: ids, deterministic: true }));
    expect(pdf.getPageCount()).toBe(ids.length);
  });
  it('the layout items are CAD objects: they are cab elements with an enclosure and moves go through commands', () => {
    const cab = cabinetOf(pump);
    expect(cab.front!.elements.every(isCab)).toBe(true);
    const moved = run(pump, [{ type: 'el/move', page: cab.front!.id, ids: [cab.devices[0].el.id], dx: 10, dy: 0 }]);
    expect(cabinetOf(moved).devices.find((d) => d.el.id === cab.devices[0].el.id)!.el.x).toBe(cab.devices[0].el.x + 10);
    expect(newProject('x', 'x').settings.layout.sparePct).toBe(20);
  });
});
