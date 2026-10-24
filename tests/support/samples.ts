// The sample projects (demo mode, product rule 10). They are built here with the same commands the
// app uses, then written to /samples by tests/samples.test.ts (UPDATE_SAMPLES=1). Generic parts and
// invented example data only: nothing from any third-party drawing.
import { FORM_PRESETS } from '@shared/forms';
import type { Library, MacroDef } from '@shared/library/types';
import { macroFromSelection } from '@shared/macros';
import type { Pt } from '@shared/model/types';
import { frameRect } from '@shared/draw/page';
import { templateOf } from '@shared/model/queries';
import { zoneRange } from '@shared/model/zones';
import { sheetMm } from '@shared/sheets';
import { reportPageCommands } from '@shared/draw/report';
import type { ReportId } from '@shared/model/types';
import { runChecks } from '@shared/checks';
import { computeBom } from '@shared/bom';
import { acceptAllCommand, sizeProject } from '@shared/feeders';
import type { Rot } from '@shared/model/types';
import { suggestLayout } from '@shared/cabinet/suggest';
import { idGen } from '@shared/ids';
import { builder } from './builder';

type B = ReturnType<typeof builder>;
type Placed = ReturnType<B['place']>;
const P = (x: number, y: number): Pt => ({ x, y });
const L3 = ['L1', 'L2', 'L3'] as const;

function dataPage(b: B, presetId: string, titles: { en: string; it: string }) {
  const preset = FORM_PRESETS.find((p) => p.id === presetId)!;
  const id = b.addPage('data', titles);
  const page = b.project.pages.find((p) => p.id === id)!;
  const f = frameRect(templateOf(b.project, page), sheetMm('A3').w, sheetMm('A3').h);
  b.run({ type: 'el/add', page: id, elements: [{ id: b.nid(), kind: 'form', x: f.fx + 10, y: f.fy + 8, w: 170, items: preset.items }] });
  return id;
}
/** Wires the three bottom pins (2, 4, 6) of one 3-pole device to the three top pins (1, 3, 5) of the next. */
function link3(b: B, pg: string, a: Placed, c: Placed, topPins = ['1', '3', '5'], bottomPins = ['2', '4', '6'], number?: () => string) {
  bottomPins.forEach((bp, i) => b.wire(pg, [a.pin(bp), c.pin(topPins[i])], number ? { number: number() } : {}));
}
const note = (b: B, pg: string, x: number, y: number, text: string) => b.text(pg, x, y, text, { size: 3 });
/** A placeholder that marks where the cabinet layout pages go; finishSample replaces it with the suggested layout once the parts are final. */
const layoutPage = (b: B, _lang: 'en' | 'it') => {
  b.addPage('layout', { en: 'Cabinet layout', it: 'Layout quadro' });
};
/** The suggested cabinet layout (the same engine the app uses), accepted as it is; it takes the place of the placeholder page. */
function cabinetLayout(b: B, lib: Library) {
  const sug = suggestLayout(b.project, lib, { newId: idGen('lay') });
  b.run({ type: 'batch', label: 'Suggested layout', commands: sug.commands });
  const ph = b.project.pages.find((p) => p.type === 'layout' && !p.layout);
  if (ph) b.run({ type: 'page/remove', id: ph.id });
}
/** Routes wires from `from` pins through the terminals of a strip (15 mm apart) to the `to` pins; the outgoing wires can be cores of a cable. */
function viaTerminals(b: B, pg: string, from: Pt[], to: Pt[], strip: string, opts: { cable?: string; cores?: string[] } = {}) {
  const yMid = Math.round((from[0].y + to[0].y) / 5) * 2.5;
  const cx = (from[1].x + to[1].x) / 2;
  from.forEach((f, i) => {
    const tx = cx + (i - 1) * 15;
    const t = b.place(pg, 'terminal', tx, yMid, { designation: strip });
    const ya = f.y + 5 + 3 * i, yb = to[i].y - 5 - 3 * (2 - i);
    b.wire(pg, [f, P(f.x, ya), P(tx, ya), t.pin('1')]);
    b.wire(pg, [t.pin('2'), P(tx, yb), P(to[i].x, yb), to[i]], { cable: opts.cable, core: opts.cores?.[i] });
  });
}
/** Issues a revision with the same command the app uses (the snapshot records every page, device, wire and part). */
function issue(b: B, number: string, date: string, description: string, status: 'proposal' | 'approval' | 'construction' | 'asBuilt', names = { drawn: 'CablePilot', checked: '', approved: '' }) {
  b.run({ type: 'revision/issue', revision: { number, date, description, status, ...names } });
}
/** The end of every sample: terminals and wires numbered, conductors coloured, report pages added before the layout page and at the end. */
function finishSample(b: B, lib: Library, early: ReportId[], late: ReportId[]) {
  let k = 0;
  const mk = (prefix: string) => `${prefix}-rep${++k}`;
  tagFreeEnds(b, lib);
  b.run({ type: 'project/settings', settings: { installationMethod: 'B1' } });
  sizeConductors(b, lib);
  sizeFeeders(b, lib);
  b.run({ type: 'terminal/renumber' });
  b.run({ type: 'wire/renumber' });
  b.run({ type: 'project/settings', settings: { wireColours: true } });
  cabinetLayout(b, lib);
  const at = b.project.pages.findIndex((p) => p.type === 'layout');
  b.run({ type: 'batch', label: 'report pages', commands: reportPageCommands(b.project, lib, early, at, mk) });
  b.run({ type: 'batch', label: 'report pages', commands: reportPageCommands(b.project, lib, late, undefined, mk) });
}
/** Wires a PLC input or output channel: the signal text on the left, a field terminal of strip -X2, the wire to the channel symbol. */
function channel(b: B, pg: string, kind: 'plc-input' | 'plc-output', addr: string, text: string, y: number, x = 200) {
  const ch = b.place(pg, kind, x, y, { value: addr });
  const t = b.place(pg, 'terminal', x - 45, y, { designation: '-X2', rot: 90 });
  const right = ['1', '2'].map((id) => t.pin(id)).sort((p, q) => q.x - p.x)[0];
  b.wire(pg, [right, ch.pin('1')]);
  b.text(pg, x - 135, y + 1.5, text, { size: 3 });
  return ch;
}
/** A PLC card as a black box with `n` channel pins (0..n-1) on the left; the part gives its type. */
function plcCard(b: B, pg: string, o: { x: number; y: number; des: string; type: 'cpu' | 'di' | 'do' | 'ai' | 'ao'; slot: number; n: number; title: { en: string; it: string }; pitch?: number; w?: number }) {
  return b.box(pg, { variant: 'blackbox', x: o.x, y: o.y, w: o.w ?? (o.type === 'cpu' ? 40 : 46), h: 20, designation: o.des, title: o.title, plc: { type: o.type, rack: '0', slot: o.slot }, pitch: o.pitch ?? 5, pins: Array.from({ length: o.n }, (_, i): [string, 'left'] => [String(i), 'left']) });
}
/** Wires one channel of a card: a field terminal of strip -X2 on its left, the wire to the channel pin, the signal text beside the terminal. */
function cardChannel(b: B, pg: string, card: ReturnType<typeof plcCard>, pin: string, text: string) {
  const pp = card.pin(pin);
  const t = b.place(pg, 'terminal', pp.x - 45, pp.y, { designation: '-X2', rot: 90 });
  const right = ['1', '2'].map((id) => t.pin(id)).sort((p, q) => q.x - p.x)[0];
  b.wire(pg, [right, pp]);
  b.text(pg, pp.x - 51, pp.y + 1.5, text, { size: 3, align: 'right' });
}
/** Gives the cards their addresses by the project's scheme, then tags and comments to the used channels: [card element id, pin, tag, comment]. */
function plcTags(b: B, pg: string, tags: [string, string, string, string][]) {
  b.run({ type: 'plc/assign' });
  b.run({ type: 'plc/channels', edits: tags.map(([el, pin, tag, comment]) => ({ page: pg, el, pin, patch: { tag, comment } })) });
}
/** Protective earth: an earth symbol joined to the incoming PE conductor (a PE tag on the free end). */
function peFeed(b: B, pg: string, x: number, y: number) {
  const e = b.place(pg, 'earth-pe', x, y);
  b.wire(pg, [e.pin('1'), P(x, y - 25)], { potential: 'PE' });
}
/** A potential tag on every free end of a wire that names a potential (the supply of the page): the end is then a proper connection point. */
function tagFreeEnds(b: B, lib: Library) {
  for (let round = 0; round < 200; round++) {
    const f = runChecks(b.project, lib).findings.find((x) => {
      if (x.rule !== 'unconnected-wire' || !x.page || !x.element) return false;
      const w = b.project.pages.find((pg) => pg.id === x.page)?.elements.find((e) => e.id === x.element);
      return w?.kind === 'wire' && !!w.potential;
    });
    if (!f || !f.at || !f.page || !f.element) return;
    const w = b.project.pages.find((pg) => pg.id === f.page)!.elements.find((e) => e.id === f.element);
    if (w?.kind !== 'wire' || !w.potential) return;
    const first = w.points[0].x === f.at.x && w.points[0].y === f.at.y;
    const nb = first ? w.points[1] : w.points[w.points.length - 2];
    const dx = Math.sign(nb.x - f.at.x), dy = Math.sign(nb.y - f.at.y);
    const rot: Rot = dx < 0 ? 0 : dx > 0 ? 180 : dy < 0 ? 90 : 270;
    b.place(f.page, 'potential-tag', f.at.x, f.at.y, { rot, value: w.potential });
  }
}
/** Applies the one-click fixes of the cross-section check, the same commands the app offers, so the sample ships correctly sized conductors. */
function sizeConductors(b: B, lib: Library) {
  for (let round = 0; round < 100; round++) {
    const f = runChecks(b.project, lib).findings.find((x) => x.rule === 'cable-size' && x.fix);
    if (!f?.fix) return;
    b.run({ type: 'batch', label: 'fix', commands: f.fix.commands });
  }
}

/** Applies "size the whole project" (the same command the app offers, without a stock list), so the sample ships with feeders that meet their requirements. */
function sizeFeeders(b: B, lib: Library) {
  const ctx = { project: b.project, lib, stock: null, bom: computeBom(b.project, lib) };
  const cmd = acceptAllCommand(ctx, sizeProject(ctx));
  if (cmd) b.run(cmd);
}

export function conveyorSample(lib: Library) {
  const b = builder(lib, 'sample-conveyor', 'Conveyor with direct-on-line starter', { drawingLanguage: 'en' });
  b.set({
    properties: { client: 'Example Conveyors Ltd', product: 'Belt conveyor C1, 5.5 kW', orderNo: 'SAMPLE-0001', drawingNo: 'SMP-CNV-001', drawn: 'CablePilot', checked: '', approved: '', issueDate: '2026-10-24', revision: 'A', copyright: 'Sample project of CablePilot (Apache-2.0). Example data only.' },
    assembly: { ratedOperationalVoltage: '400', ratedInsulationVoltage: '690', ratedImpulseVoltage: '6', ratedCurrent: '32', ratedShortTimeCurrent: '10', ratedFrequency: '50', ratedDiversityFactor: '1', earthingSystem: 'TN-S', formOfSeparation: '1', ipDegree: 'IP54', installation: 'indoor', mobility: 'fixed', enclosureMaterial: 'Sheet steel, powder coated' },
  });
  b.run({ type: 'project/settings', settings: { crossRef: { format: 'page.column', pageDigits: 0 } } });
  b.addPage('cover', { en: 'Cover sheet' });
  b.addPage('contents', { en: 'Contents' });
  dataPage(b, 'iec61439-general', { en: 'General data of the assembly', it: "Dati generali dell'assieme" });
  // Single-line overview with conductor tick marks: -QF1, -KM1 and -M1 are drawn again on the
  // multi-line pages. Same designation, one device: counted once in the BOM, cross-referenced both ways.
  const sl = b.addPage('singleLine', { en: 'Single-line diagram' }, { location: 'DS' });
  const X0 = 210;
  const q = b.place(sl, 'mcb-1p', X0, 75, { designation: '-QF1', functionText: { en: 'Motor circuit breaker 32 A' } });
  const k = b.place(sl, 'contactor-1p', X0, 115, { designation: '-KM1', functionText: { en: 'Conveyor contactor' } });
  const m = b.place(sl, 'motor-3ph', X0, 165, { designation: '-M1', functionText: { en: 'Conveyor motor\n5.5 kW' } });
  b.wire(sl, [P(X0, 35), q.pin('1')], { conductors: 3, potential: 'L1' });
  b.wire(sl, [q.pin('2'), k.pin('1')], { conductors: 3 });
  b.wire(sl, [k.pin('2'), m.pin('V')], { conductors: 3 });
  b.text(sl, 60, 40, 'Mains 400 V 3~ 50 Hz', { size: 3.5 });
  b.rect(sl, X0 - 45, 50, 90, 150, { dashed: true, label: 'Conveyor starter' });
  b.warning(sl, X0 + 80, 70, 'electric');
  // Power circuit.
  const pw = b.addPage('power', { en: 'Motor power circuit' }, { location: 'DS' });
  const qs = b.place(pw, 'switch-disconnector-3p', X0, 55, { designation: '-QS1', functionText: { en: 'Main isolator' } });
  const qf = b.place(pw, 'mcb-3p', X0, 85, { designation: '-QF1', functionText: { en: 'Motor circuit breaker 32 A' } });
  const km = b.place(pw, 'contactor-3p', X0, 115, { designation: '-KM1', functionText: { en: 'Conveyor contactor' } });
  const fr = b.place(pw, 'overload-relay-3p', X0, 145, { designation: '-FR1', functionText: { en: 'Overload relay' } });
  const mo = b.place(pw, 'motor-3ph', X0, 230, { designation: '-M1', functionText: { en: 'Conveyor motor\n5.5 kW 400 V' } });
  let n = 0;
  const num = () => String(++n);
  [-5, 0, 5].forEach((dx, i) => b.wire(pw, [P(X0 + dx, 25), qs.pin(['1', '3', '5'][i])], { potential: L3[i] }));
  link3(b, pw, qs, qf, undefined, undefined, num);
  link3(b, pw, qf, km, undefined, undefined, num);
  link3(b, pw, km, fr, undefined, undefined, num);
  // Field wiring: the motor is connected through terminal strip -X1 with a motor cable -W1.
  viaTerminals(b, pw, [fr.pin('2'), fr.pin('4'), fr.pin('6')], ['U', 'V', 'W'].map((p) => mo.pin(p)), '-X1', { cable: '-W1', cores: ['BN', 'BK', 'GY'] });
  peFeed(b, pw, 360, 60);
  b.rect(pw, X0 - 40, 40, 80, 125, { dashed: true, label: 'Starter' });
  b.warning(pw, X0 - 100, 60, 'electric');
  note(b, pw, X0 + 60, 80, 'Motor starter, direct on line.\nProtection: motor circuit breaker\nand overload relay.');
  // Control circuit: the coil -KM1 shows its contact image (power part, self-hold, lamp) with page.column references.
  const ct = b.addPage('control', { en: 'Control circuit 24 V DC' }, { location: 'DS' });
  const g = b.place(ct, 'power-supply', 60, 50, { mirror: true, designation: '-G1', functionText: { en: 'Power supply 24 V' } });
  b.wire(ct, [P(g.pin('N').x, 25), g.pin('N')], { potential: 'N' });
  b.wire(ct, [P(g.pin('L').x, 25), g.pin('L')], { potential: 'L1' });
  b.wire(ct, [g.pin('+'), P(g.pin('+').x, 70), P(320, 70)], { potential: '24VDC' });
  b.wire(ct, [g.pin('-'), P(g.pin('-').x, 240), P(320, 240)], { potential: '0V' });
  const X1 = 140, X2 = 190, X3 = 250;
  const s0 = b.place(ct, 'emergency-stop', X1, 95, { designation: '-S0', functionText: { en: 'Emergency stop' } });
  const s2 = b.place(ct, 'pushbutton-nc', X1, 117, { designation: '-S2', functionText: { en: 'Stop' } });
  const s1 = b.place(ct, 'pushbutton-no', X1, 139, { designation: '-S1', functionText: { en: 'Start' } });
  const f1 = b.place(ct, 'contact-nc', X1, 161, { designation: '-FR1', functionText: { en: 'Overload relay' } });
  const c1 = b.place(ct, 'coil', X1, 195, { designation: '-KM1', functionText: { en: 'Conveyor contactor' } });
  b.wire(ct, [P(X1, 70), s0.pin('1')]);
  b.wire(ct, [s0.pin('2'), s2.pin('1')]);
  b.wire(ct, [s2.pin('2'), s1.pin('3')]);
  b.wire(ct, [s1.pin('4'), f1.pin('1')]);
  b.wire(ct, [f1.pin('2'), c1.pin('A1')]);
  b.wire(ct, [c1.pin('A2'), P(X1, 240)]);
  const hold = b.place(ct, 'contact-no', X2, 139, { designation: '-KM1', functionText: { en: 'Self-hold' } });
  b.wire(ct, [P(X1, 128), P(X2, 128), hold.pin('1')]);
  b.wire(ct, [hold.pin('2'), P(X2, 150), P(X1, 150)]);
  const lampC = b.place(ct, 'contact-no', X3, 160, { designation: '-KM1', functionText: { en: 'Run' } });
  const h1 = b.place(ct, 'lamp', X3, 195, { designation: '-H1', functionText: { en: 'Conveyor running' } });
  b.wire(ct, [P(X3, 70), lampC.pin('1')]);
  b.wire(ct, [lampC.pin('2'), h1.pin('1')]);
  b.wire(ct, [h1.pin('2'), P(X3, 240)]);
  note(b, ct, 275, 110, 'Start and stop with the pushbuttons.\nThe emergency stop opens the\ncontrol circuit.');
  // The 24 V rail continues on the PLC page: an interruption point pair carrying the same signal name.
  b.place(ct, 'interruption-point', 320, 70, { value: 'PLC-24V' });
  // PLC page.
  const plc = b.addPage('plc', { en: 'PLC inputs and outputs' }, { location: 'DS' });
  const di = plcCard(b, plc, { x: 125, y: 50, des: '-A2', type: 'di', slot: 1, n: 8, pitch: 12, title: { en: 'Digital inputs 24 V DC', it: 'Ingressi digitali 24 V DC' } });
  const dq = plcCard(b, plc, { x: 325, y: 50, des: '-A3', type: 'do', slot: 2, n: 8, pitch: 12, title: { en: 'Digital outputs 24 V DC', it: 'Uscite digitali 24 V DC' } });
  plcCard(b, plc, { x: 182, y: 200, des: '-A1', type: 'cpu', slot: 0, n: 0, title: { en: 'PLC CPU', it: 'CPU PLC' } });
  cardChannel(b, plc, di, '0', 'Emergency stop healthy');
  cardChannel(b, plc, di, '1', 'Start');
  cardChannel(b, plc, di, '2', 'Stop');
  cardChannel(b, plc, dq, '0', 'Conveyor contactor');
  cardChannel(b, plc, dq, '1', 'Running lamp');
  plcTags(b, plc, [[di.id, '0', 'S0_EStop_OK', 'Emergency stop healthy'], [di.id, '1', 'S1_Start', 'Start pushbutton'], [di.id, '2', 'S2_Stop', 'Stop pushbutton'], [dq.id, '0', 'KM1_Run', 'Conveyor contactor'], [dq.id, '1', 'H1_Running', 'Running lamp']]);
  b.wire(plc, [P(100, 35), P(160, 35)], { potential: '24VDC' });
  b.place(plc, 'interruption-point', 160, 35, { value: 'PLC-24V' });
  b.text(plc, 100, 28, 'Supply of the PLC outputs', { size: 3 });
  layoutPage(b, 'en');
  // Parts (generic): the BOM is generated from these assignments and the schematic.
  b.parts(pw, '-QS1', [['generic-switch-disconnector-3p-63a', 1]]);
  b.parts(pw, '-QF1', [['generic-mcb-3p-c16a', 1]]);
  b.parts(pw, '-KM1', [['generic-contactor-12a', 1], ['generic-aux-block-1no1nc', 1]]);
  b.parts(pw, '-FR1', [['generic-overload-relay-9a-13a', 1]]);
  b.parts(pw, '-M1', [['generic-motor-3ph-5.5kw', 1]]);
  b.parts(ct, '-G1', [['generic-psu-24vdc-10a', 1]]);
  b.parts(ct, '-S0', [['generic-emergency-stop-22mm', 1]]);
  b.parts(ct, '-S1', [['generic-pushbutton-22mm-no', 1]]);
  b.parts(ct, '-S2', [['generic-pushbutton-22mm-nc', 1]]);
  b.parts(ct, '-H1', [['generic-pilot-lamp-22mm-24vdc', 1]]);
  b.parts(plc, '-A1', [['generic-plc-cpu-compact', 1], ['generic-plc-rack-4slot', 1]]);
  b.parts(plc, '-A2', [['generic-plc-di-8-24vdc', 1]]);
  b.parts(plc, '-A3', [['generic-plc-do-8-24vdc', 1]]);
  b.fields(pw, '-QS1', { make: 'Buy' });
  b.fields(pw, '-M1', { make: 'Buy', notes: 'Supplied by the customer' });
  // Sizing data (M6 part 1): the motor nameplate (5.5 kW, cos phi 0.85, 87 %) and the supply of the board.
  b.load(pw, '-M1', { kind: 'motor', powerKw: 5.5, cosPhi: 0.85, efficiency: 87, starter: 'dol', curve: 'C' });
  b.run({ type: 'project/settings', settings: { supply: { voltage: 400, ik: 6, ambient: 30, grouping: 1, maxDropPct: 5 } } });
  b.projectPart('generic-enclosure-600x800x300', 1, { make: 'Buy' });
  b.projectPart('generic-mounting-plate-600x800', 1, { make: 'Buy' });
  b.projectPart('generic-wiring-kit', 1, { make: 'Make' });
  b.projectPart('generic-terminal-feedthrough-4mm2', 9);
  b.projectPart('generic-terminal-pe-4mm2', 3);
  b.parts(pw, '-X1', [['generic-terminal-feedthrough-4mm2', 1], ['generic-terminal-end-plate', 1], ['generic-terminal-end-stop', 2]]);
  b.parts(plc, '-X2', [['generic-terminal-feedthrough-4mm2', 1], ['generic-terminal-end-plate', 1], ['generic-terminal-end-stop', 2]]);
  b.run({ type: 'part/embed', def: lib.parts.get('generic-cable-power-4x2.5mm2')! });
  b.run({ type: 'cable/set', cable: { id: '-W1', kind: 'multicore', part: 'generic-cable-power-4x2.5mm2', length: '12 m', functionText: { en: 'Motor cable' } } });
  b.fields(pw, '-QF1', { nameplate: 'Conveyor motor\nbreaker' });
  finishSample(b, lib, ['terminals', 'cables'], ['wires', 'bom', 'legend', 'colours', 'suffixes', 'torque', 'nameplates', 'plcIo']);
  issue(b, '0', '2026-10-24', 'First issue for approval', 'approval');
  return b.project;
}

export function pumpSample(lib: Library) {
  const b = builder(lib, 'sample-pump-station', 'Pump station, two pumps', { drawingLanguage: 'en' });
  b.set({
    properties: { client: 'Example Water Utility', product: 'Pump station PS1, 2 x 7.5 kW', orderNo: 'SAMPLE-0002', drawingNo: 'SMP-PMP-001', drawn: 'CablePilot', issueDate: '2026-10-24', revision: 'A', copyright: 'Sample project of CablePilot (Apache-2.0). Example data only.' },
    assembly: { ratedOperationalVoltage: '400', ratedInsulationVoltage: '690', ratedImpulseVoltage: '6', ratedCurrent: '63', ratedShortTimeCurrent: '10', ratedFrequency: '50', ratedDiversityFactor: '0.8', earthingSystem: 'TT', formOfSeparation: '2b', ipDegree: 'IP55', installation: 'outdoor', mobility: 'fixed', enclosureMaterial: 'Stainless steel' },
  });
  b.run({ type: 'project/settings', settings: { crossRef: { format: 'page.column', pageDigits: 0 }, bom: { ...b.project.settings.bom, units: 1 } } });
  b.addPage('cover', { en: 'Cover sheet' });
  b.addPage('contents', { en: 'Contents' });
  dataPage(b, 'iec61439-general', { en: 'General data of the assembly', it: "Dati generali dell'assieme" });
  const sl = b.addPage('singleLine', { en: 'Single-line diagram' }, { location: 'PS' });
  const q0 = b.place(sl, 'mcb-1p', 215, 60, { designation: '-QF0', functionText: { en: 'Incomer 63 A' } });
  b.wire(sl, [P(215, 30), q0.pin('1')], { conductors: 3, potential: 'L1' });
  b.wire(sl, [q0.pin('2'), P(215, 80)], { conductors: 3 });
  b.wire(sl, [P(140, 80), P(290, 80)], { conductors: 3 });
  [[140, 'Pump 1'], [290, 'Pump 2']].forEach(([x, name], i) => {
    const q = b.place(sl, 'mcb-1p', x as number, 105, { designation: `-QF${i + 1}`, functionText: { en: `Pump ${i + 1} motor breaker` } });
    const k = b.place(sl, 'contactor-1p', x as number, 140, { designation: `-KM${i * 3 + 1}`, functionText: { en: 'Main contactor' } });
    const m = b.place(sl, 'motor-3ph', x as number, 190, { designation: `-M${i + 1}`, functionText: { en: `${name as string}\n7.5 kW, star-delta` } });
    b.wire(sl, [P(x as number, 80), q.pin('1')], { conductors: 3 });
    b.wire(sl, [q.pin('2'), k.pin('1')], { conductors: 3 });
    b.wire(sl, [k.pin('2'), m.pin('V')], { conductors: 3 });
  });
  // Power: one star-delta starter per pump. Main contactor -KM1 feeds U1 V1 W1; the delta contactor
  // -KM2 joins U1-W2, V1-U2, W1-V2; the star contactor -KM3 joins W2, U2 and V2 (IEC 60034-8 marks).
  const pw = b.addPage('power', { en: 'Pump power circuits, star-delta' }, { location: 'PS' });
  let n = 0;
  const num = () => String(++n);
  [110, 300].forEach((X, i) => {
    const d = i * 3;
    const qf = b.place(pw, 'mcb-3p', X, 55, { designation: `-QF${i + 1}`, functionText: { en: `Pump ${i + 1} motor breaker` } });
    const km1 = b.place(pw, 'contactor-3p', X, 80, { designation: `-KM${d + 1}`, functionText: { en: 'Main contactor' } });
    const fr = b.place(pw, 'overload-relay-3p', X, 105, { designation: `-FR${i + 1}`, functionText: { en: 'Overload relay' } });
    const mo = b.place(pw, 'motor-3ph-6', X, 160, { designation: `-M${i + 1}`, functionText: { en: `Pump ${i + 1}\n7.5 kW, star-delta` } });
    const km2 = b.place(pw, 'contactor-3p', X + 35, 170, { designation: `-KM${d + 2}`, functionText: { en: 'Delta contactor' } });
    const km3 = b.place(pw, 'contactor-3p', X, 205, { designation: `-KM${d + 3}`, functionText: { en: 'Star contactor' } });
    [-5, 0, 5].forEach((dx, j) => b.wire(pw, [P(X + dx, 28), qf.pin(['1', '3', '5'][j])], { potential: L3[j] }));
    link3(b, pw, qf, km1, undefined, undefined, num);
    link3(b, pw, km1, fr, undefined, undefined, num);
    link3(b, pw, fr, mo, ['U1', 'V1', 'W1'], undefined, num);
    // Delta: top pins 1, 3, 5 tap U1, V1, W1; bottom pins 2, 4, 6 reach W2, U2, V2.
    b.wire(pw, [km2.pin('1'), P(X + 30, 130), P(X - 5, 130)]);
    b.wire(pw, [km2.pin('3'), P(X + 35, 127.5), P(X, 127.5)]);
    b.wire(pw, [km2.pin('5'), P(X + 40, 125), P(X + 5, 125)]);
    b.wire(pw, [km2.pin('2'), P(X + 30, 185), P(X - 5, 185)]);
    b.wire(pw, [km2.pin('4'), P(X + 35, 182.5), P(X, 182.5)]);
    b.wire(pw, [km2.pin('6'), P(X + 40, 180), P(X + 5, 180)]);
    // Star: top pins on W2, U2, V2, bottom pins tied together.
    b.wire(pw, [mo.pin('W2'), km3.pin('1')]);
    b.wire(pw, [mo.pin('U2'), km3.pin('3')]);
    b.wire(pw, [mo.pin('V2'), km3.pin('5')]);
    b.wire(pw, [km3.pin('2'), km3.pin('6')]);
    b.rect(pw, X - 20, 40, 95, 185, { dashed: true, label: `Star-delta starter, pump ${i + 1}` });
  });
  peFeed(b, pw, 390, 50);
  note(b, pw, 160, 240, 'Star-delta starting: the star contactor closes with the main contactor;\nafter the timer it opens and the delta contactor closes.');
  // Control: level switch, overload contact, timer and the three contactor coils per pump.
  const ct = b.addPage('control', { en: 'Pump control, star-delta' }, { location: 'PS' });
  b.wire(ct, [P(40, 50), P(395, 50)], { potential: '24VDC' });
  b.wire(ct, [P(40, 240), P(395, 240)], { potential: '0V' });
  [50, 235].forEach((x0, i) => {
    const d = i * 3;
    const bl = b.place(ct, 'limit-switch-no', x0, 80, { designation: `-BL${i + 1}`, functionText: { en: i === 0 ? 'Low level, start pump 1' : 'Low level, start pump 2' } });
    const fc = b.place(ct, 'contact-nc', x0, 98, { designation: `-FR${i + 1}`, functionText: { en: 'Overload relay' } });
    // Field wiring: the level switch is fed through a terminal of strip -X1.
    const tx = b.place(ct, 'terminal', x0, 60, { designation: '-X1' });
    b.wire(ct, [P(x0, 50), tx.pin('1')]);
    b.wire(ct, [tx.pin('2'), bl.pin('3')]);
    b.wire(ct, [bl.pin('4'), fc.pin('1')]);
    b.wire(ct, [fc.pin('2'), P(x0, 105)]);
    b.wire(ct, [P(x0, 105), P(x0 + 135, 105)]);
    // A: main contactor coil. B: timer coil. C: KT1 NC then star coil. D: KT1 NO, KM3 NC then delta coil.
    const km1 = b.place(ct, 'coil', x0, 170, { designation: `-KM${d + 1}`, functionText: { en: 'Main contactor' } });
    const kt = b.place(ct, 'coil', x0 + 45, 170, { designation: `-KT${i + 1}`, functionText: { en: 'Star-delta timer' } });
    const ktNc = b.place(ct, 'contact-nc', x0 + 90, 125, { designation: `-KT${i + 1}`, functionText: { en: 'Star time' } });
    const km3 = b.place(ct, 'coil', x0 + 90, 170, { designation: `-KM${d + 3}`, functionText: { en: 'Star contactor' } });
    const ktNo = b.place(ct, 'contact-no', x0 + 135, 125, { designation: `-KT${i + 1}`, functionText: { en: 'Delta time' } });
    const km3Nc = b.place(ct, 'contact-nc', x0 + 135, 145, { designation: `-KM${d + 3}`, functionText: { en: 'Interlock' } });
    const km2 = b.place(ct, 'coil', x0 + 135, 175, { designation: `-KM${d + 2}`, functionText: { en: 'Delta contactor' } });
    b.wire(ct, [P(x0, 105), km1.pin('A1')]);
    b.wire(ct, [P(x0 + 45, 105), kt.pin('A1')]);
    b.wire(ct, [P(x0 + 90, 105), ktNc.pin('1')]);
    b.wire(ct, [ktNc.pin('2'), km3.pin('A1')]);
    b.wire(ct, [P(x0 + 135, 105), ktNo.pin('1')]);
    b.wire(ct, [ktNo.pin('2'), km3Nc.pin('1')]);
    b.wire(ct, [km3Nc.pin('2'), km2.pin('A1')]);
    for (const c of [km1, kt, km3]) b.wire(ct, [c.pin('A2'), P(c.pin('A2').x, 240)]);
    b.wire(ct, [km2.pin('A2'), P(km2.pin('A2').x, 240)]);
  });
  // PLC page.
  const plc = b.addPage('plc', { en: 'PLC interface' }, { location: 'PS' });
  const io: [string, string][] = [['I0.0', 'Low level pump 1'], ['I0.1', 'Low level pump 2'], ['I0.2', 'Pump 1 overload'], ['Q0.0', 'Pump 1 run'], ['Q0.1', 'Pump 2 run']];
  io.forEach(([a, sig], i) => channel(b, plc, a.startsWith('I') ? 'plc-input' : 'plc-output', a, sig, 60 + i * 16));
  b.assembly(plc, '-A1', { x: 198, y: 48, w: 28, h: 90, label: 'PLC' }, []);
  layoutPage(b, 'en');
  // Parts.
  b.parts(sl, '-QF0', [['generic-mcb-3p-c63a', 1]]);
  b.parts(pw, '-QF1', [['generic-mpcb-10a-16a', 1]]);
  b.parts(pw, '-QF2', [['generic-mpcb-10a-16a', 1]]);
  for (let i = 0; i < 2; i++) {
    b.parts(pw, `-KM${i * 3 + 1}`, [['generic-contactor-18a', 1], ['generic-aux-block-1no1nc', 1]]);
    b.parts(pw, `-KM${i * 3 + 2}`, [['generic-contactor-18a', 1]]);
    b.parts(pw, `-KM${i * 3 + 3}`, [['generic-contactor-12a', 1], ['generic-aux-block-1no1nc', 1]]);
    b.parts(pw, `-FR${i + 1}`, [['generic-overload-relay-12a-18a', 1]]);
    b.load(pw, `-M${i + 1}`, { kind: 'motor', powerKw: 7.5, cosPhi: 0.85, efficiency: 90, starter: 'star-delta', curve: 'C', length: 25 });
    b.parts(pw, `-M${i + 1}`, [['generic-motor-3ph-7.5kw', 1]]);
    b.parts(ct, `-KT${i + 1}`, [['generic-timer-relay-star-delta', 1], ['generic-aux-block-1no1nc', 1]]);
    b.parts(ct, `-BL${i + 1}`, [['generic-limit-switch-1no', 1]]);
  }
  b.parts(plc, '-A1', [['generic-plc-cpu-compact', 1], ['generic-plc-di-16-24vdc', 1], ['generic-plc-do-16-24vdc', 1]]);
  b.parts(plc, '-X2', [['generic-terminal-feedthrough-4mm2', 1], ['generic-terminal-end-plate', 1], ['generic-terminal-end-stop', 2]]);
  b.run({ type: 'project/settings', settings: { supply: { voltage: 400, ik: 10, ambient: 30, grouping: 1, maxDropPct: 5 } } });
  b.projectPart('generic-enclosure-800x1000x300', 1, { make: 'Buy' });
  b.projectPart('generic-mounting-plate-600x800', 1, { make: 'Buy' });
  b.projectPart('generic-wiring-kit', 1, { make: 'Make' });
  b.projectPart('generic-din-rail-35mm-1m', 2);
  b.projectPart('generic-terminal-feedthrough-4mm2', 22);
  b.projectPart('generic-terminal-pe-10mm2', 6);
  b.parts(ct, '-X1', [['generic-terminal-feedthrough-2.5mm2', 1], ['generic-terminal-end-plate', 1]]);
  finishSample(b, lib, ['terminals', 'cables'], ['wires', 'bom', 'legend', 'colours', 'suffixes', 'torque', 'nameplates']);
  issue(b, '0', '2026-10-24', 'First issue as a proposal', 'proposal');
  return b.project;
}

export function chargerSample(lib: Library) {
  const b = builder(lib, 'sample-dc-charger', 'Caricabatterie 110 V DC', { drawingLanguage: 'it' });
  b.set({
    properties: { client: 'Cliente di esempio S.r.l.', product: 'Quadro caricabatterie 110 V DC', orderNo: 'ESEMPIO-0003', drawingNo: 'SMP-CHG-001', drawn: 'CablePilot', issueDate: '2026-10-24', revision: 'A', copyright: 'Progetto di esempio di CablePilot (Apache-2.0). Solo dati di esempio.' },
    assembly: { ratedOperationalVoltage: '400', ratedInsulationVoltage: '690', ratedImpulseVoltage: '6', ratedCurrent: '40', ratedShortTimeCurrent: '10', ratedFrequency: '50', ratedDiversityFactor: '1', earthingSystem: 'TN-S', formOfSeparation: '1', ipDegree: 'IP31', installation: 'indoor', mobility: 'fixed', enclosureMaterial: 'Lamiera di acciaio verniciata', dcOutputVoltage: '110', dcOutputCurrent: '30', batteryType: 'Piombo-acido ermetico', batteryNominalVoltage: '110', batteryCapacity: '100' },
  });
  // Frame zones as on production sets: columns A to H then M to U (skipping O and Q), rows 0 to 9, so cross-references read like [08-E3] (page-column-row).
  const tpl = structuredClone(b.project.templates[0]);
  tpl.frame.columns = [...zoneRange('A', 'H'), ...zoneRange('M', 'U', ['O', 'Q'])];
  tpl.frame.rows = zoneRange('0', '9');
  b.run({ type: 'template/upsert', template: tpl });
  b.run({ type: 'project/settings', settings: { crossRef: { format: 'page-column-row', pageDigits: 2 }, bom: { ...b.project.settings.bom, units: 1, userFields: [{ id: 'make', label: { en: 'Make or buy', it: 'Produzione o acquisto' } }, { id: 'notes', label: { en: 'Notes', it: 'Note' } }] } } });
  b.addPage('cover', { en: 'Cover sheet', it: 'Copertina' });
  b.addPage('contents', { en: 'Contents', it: 'Indice' });
  dataPage(b, 'iec61439-general', { en: 'General data of the assembly', it: "Dati generali dell'assieme" });
  dataPage(b, 'battery-dc', { en: 'Battery and DC output data', it: 'Dati batteria e uscita DC' });
  // Single-line overview (page 05).
  const sl = b.addPage('singleLine', { en: 'Single-line diagram', it: 'Schema unifilare' }, { location: 'DS' });
  const qf = b.place(sl, 'mcb-1p', 130, 60, { designation: '-QF1', functionText: { it: 'Interruttore di ingresso', en: 'Input breaker' } });
  const tr = b.place(sl, 'transformer-3ph', 130, 110, { designation: '-T1', functionText: { it: 'Trasformatore\nDyn11', en: 'Transformer\nDyn11' } });
  b.wire(sl, [P(130, 30), qf.pin('1')], { conductors: 3, potential: 'L1' });
  b.wire(sl, [qf.pin('2'), tr.pin('1V')], { conductors: 3 });
  const r1 = b.place(sl, 'rectifier-3ph', 90, 180, { designation: '-U1', functionText: { it: 'Modulo raddrizzatore 1', en: 'Rectifier module 1' } });
  const r2 = b.place(sl, 'rectifier-3ph', 170, 180, { designation: '-U2', functionText: { it: 'Modulo raddrizzatore 2', en: 'Rectifier module 2' } });
  b.wire(sl, [tr.pin('2V'), P(130, 140), P(90, 140), r1.pin('L2')], { conductors: 3 });
  b.wire(sl, [P(130, 140), P(170, 140), r2.pin('L2')], { conductors: 3 });
  b.rect(sl, 65, 155, 50, 55, { dashed: true });
  b.rect(sl, 145, 155, 50, 55, { dashed: true });
  b.place(sl, 'battery', 300, 225, { designation: '-G1', functionText: { it: 'Batteria 110 V', en: 'Battery 110 V' } });
  b.wire(sl, [r1.pin('DC+'), P(r1.pin('DC+').x, 205), P(300, 205), P(300, 217.5)], { conductors: 2, potential: 'L+' });
  b.wire(sl, [r2.pin('DC+'), P(r2.pin('DC+').x, 205)]);
  b.warning(sl, 300, 70, 'electric');
  b.text(sl, 200, 70, 'Alimentazione 400 V 3~ 50 Hz\nUscita 110 V DC', { size: 3.5 });
  // Power: input and rectifiers (page 06). The DC output continues on page 07 through interruption points.
  const pw = b.addPage('power', { en: 'Input and rectifier modules', it: 'Ingresso e moduli raddrizzatori' }, { location: 'DS' });
  let n = 0;
  const num = () => String(++n).padStart(3, '0');
  // The page is laid out across the sheet: input breaker and transformer on the left, the two rectifier modules side by side, the DC bus to the right.
  const XA = 100, XB = 240;
  const q1 = b.place(pw, 'mcb-3p', XA, 55, { designation: '-QF1', functionText: { it: 'Interruttore di ingresso', en: 'Input breaker' } });
  const t1 = b.place(pw, 'transformer-3ph', XA, 112, { designation: '-T1', functionText: { it: 'Trasformatore trifase', en: 'Three-phase transformer' } });
  [XA - 5, XA, XA + 5].forEach((x, i) => b.wire(pw, [P(x, 25), q1.pin(['1', '3', '5'][i])], { potential: L3[i] }));
  link3(b, pw, q1, t1, ['1U', '1V', '1W'], ['2', '4', '6'], num);
  const u1 = b.place(pw, 'rectifier-3ph', XA, 190, { designation: '-U1', functionText: { it: 'Modulo raddrizzatore 1', en: 'Rectifier module 1' } });
  const u2 = b.place(pw, 'rectifier-3ph', XB, 190, { designation: '-U2', functionText: { it: 'Modulo raddrizzatore 2', en: 'Rectifier module 2' } });
  ['2U', '2V', '2W'].forEach((p, i) => b.wire(pw, [t1.pin(p), u1.pin(L3[i])], { number: `${num()}${'LMN'[i]}` }));
  // The second module takes the three phases from taps on the wires above the first one.
  const ym = Math.round((t1.pin('2U').y + u1.pin('L1').y) / 5) * 2.5;
  ['2U', '2V', '2W'].forEach((p, i) => b.wire(pw, [P(t1.pin(p).x, ym + 4 - 4 * i), P(u2.pin(L3[i]).x, ym + 4 - 4 * i), u2.pin(L3[i])]));
  const yP = 222, yM = 238;
  b.wire(pw, [u1.pin('DC+'), P(u1.pin('DC+').x, yP), P(300, yP)], { potential: 'L+' });
  b.wire(pw, [u2.pin('DC+'), P(u2.pin('DC+').x, yP)]);
  b.wire(pw, [u1.pin('DC-'), P(u1.pin('DC-').x, yM), P(300, yM)], { potential: 'L-' });
  b.wire(pw, [u2.pin('DC-'), P(u2.pin('DC-').x, yM)]);
  b.place(pw, 'interruption-point', 300, yP, { value: 'L+' });
  b.place(pw, 'interruption-point', 300, yM, { value: 'L-' });
  b.rect(pw, XA - 20, 168, 40, 44, { dashed: true });
  b.rect(pw, XB - 20, 168, 40, 44, { dashed: true });
  peFeed(b, pw, 380, 60);
  b.warning(pw, 45, 100, 'electric');
  note(b, pw, 300, 90, 'Uscita 110 V DC, 30 A.\nI due moduli lavorano in parallelo.');
  // DC output and battery (page 07): the switching block -A5 holds fuse, contactor, diode and current sensor.
  const dc = b.addPage('power', { en: 'DC output and battery', it: 'Uscita DC e batteria' }, { location: 'DS' });
  b.place(dc, 'interruption-point', 40, 80, { value: 'L+', mirror: true });
  b.place(dc, 'interruption-point', 40, 170, { value: 'L-', mirror: true });
  const f1 = b.place(dc, 'fuse', 80, 80, { rot: 90, designation: '-F1', functionText: { it: 'Fusibile batteria', en: 'Battery fuse' } });
  const km = b.place(dc, 'contactor-1p', 112, 80, { rot: 90, designation: '-KM1', functionText: { it: 'Contattore DC', en: 'DC contactor' } });
  const v1 = b.place(dc, 'diode', 144, 80, { rot: 270, designation: '-V1', functionText: { it: 'Diodo di blocco', en: 'Blocking diode' } });
  const bs = b.place(dc, 'hall-sensor', 176, 80, { designation: '-B1', functionText: { it: 'Sensore di corrente', en: 'Current sensor' } });
  const g1 = b.place(dc, 'battery', 290, 125, { designation: '-G1', functionText: { it: 'Batteria 110 V', en: 'Battery 110 V' } });
  const p1 = b.place(dc, 'voltmeter', 250, 125, { designation: '-P1', functionText: { it: 'Tensione batteria', en: 'Battery voltage' } });
  b.wire(dc, [P(40, 80), f1.pin('2')], { potential: 'L+' });
  b.wire(dc, [f1.pin('1'), km.pin('2')]);
  b.wire(dc, [km.pin('1'), v1.pin('A')]);
  b.wire(dc, [v1.pin('K'), P(290, 80), g1.pin('+')]);
  b.wire(dc, [P(40, 170), P(290, 170)], { potential: 'L-' });
  b.wire(dc, [g1.pin('-'), P(290, 170)]);
  b.wire(dc, [P(250, 80), p1.pin('1')]);
  b.wire(dc, [p1.pin('2'), P(250, 170)]);
  b.wire(dc, [bs.pin('+'), P(173.5, 60)], { potential: '24VDC' });
  b.wire(dc, [bs.pin('-'), P(178.5, 67.5), P(186, 67.5)], { potential: '0V' });
  b.wire(dc, [bs.pin('OUT'), P(176, 100)]);
  b.place(dc, 'interruption-point', 176, 100, { value: 'IOUT' });
  b.assembly(dc, '-A5', { x: 65, y: 53, w: 165, h: 45, label: 'Blocco di manovra' }, ['-F1', '-KM1', '-V1', '-B1']);
  // Output to the load through terminal strip -X1 (terminals 1 and 2).
  const xo1 = b.place(dc, 'terminal', 330, 95, { designation: '-X1', functionText: { it: 'Uscita carico L+', en: 'Load output L+' } });
  const xo2 = b.place(dc, 'terminal', 360, 95, { designation: '-X1', functionText: { it: 'Uscita carico L-', en: 'Load output L-' } });
  b.wire(dc, [P(290, 80), P(330, 80), xo1.pin('1')]);
  b.wire(dc, [xo1.pin('2'), P(330, 125)], { potential: 'L+' });
  b.wire(dc, [P(290, 170), P(385, 170), P(385, 75), P(360, 75), xo2.pin('1')]);
  b.wire(dc, [xo2.pin('2'), P(360, 125)], { potential: 'L-' });
  b.warning(dc, 370, 30, 'electric');
  note(b, dc, 40, 215, 'Batteria: 54 elementi al piombo da 2 V in serie (108 V).\nIl sensore -B1 misura la corrente di uscita (segnale IOUT).');
  // Alarm relays and the plug to the PLC interface (page 08).
  const al = b.addPage('control', { en: 'Alarm relays', it: 'Relè di allarme' }, { location: 'DS' });
  b.wire(al, [P(40, 60), P(395, 60)], { potential: '24VDC' });
  b.wire(al, [P(40, 200), P(395, 200)], { potential: '0V' });
  const k1 = b.place(al, 'coil', 70, 100, { designation: '-K1', functionText: { it: 'Relè controllo fasi', en: 'Phase monitoring relay' }, stateNote: { it: 'Contatti rappresentati con relè in allarme', en: 'Contacts shown with relay in alarm' } });
  b.wire(al, [P(70, 60), k1.pin('A1')]);
  b.wire(al, [k1.pin('A2'), P(70, 200)]);
  const k1c = b.place(al, 'contact-no', 130, 140, { designation: '-K1', functionText: { it: 'Mancanza rete', en: 'Mains failure' } });
  const h1 = b.place(al, 'lamp', 130, 175, { designation: '-H1', functionText: { it: 'Segnalazione mancanza rete', en: 'Mains failure indication' } });
  b.wire(al, [P(130, 60), k1c.pin('1')]);
  b.wire(al, [k1c.pin('2'), h1.pin('1')]);
  b.wire(al, [h1.pin('2'), P(130, 200)]);
  // The battery-low stage is a macro from the library, placed in one command.
  b.run({ type: 'macro/place', page: al, macro: alarmStageMacro(lib), x: 190, y: 60, prefix: 'mc1' });
  const kc = b.place(al, 'coil', 360, 100, { designation: '-KM1', functionText: { it: 'Contattore DC batteria', en: 'Battery DC contactor' } });
  b.wire(al, [P(360, 60), kc.pin('A1')]);
  b.wire(al, [kc.pin('A2'), P(360, 200)]);
  const x11 = b.box(al, { variant: 'connector', x: 300, y: 125, w: 20, h: 20, designation: '-X11', gender: 'plug', mate: '-X10', title: { it: 'Spina', en: 'Plug' }, pins: [['1', 'left', 'K1'], ['2', 'left', 'K2'], ['3', 'right', '24V'], ['4', 'right', '0V']] });
  b.wire(al, [P(130, 152.5), P(270, 152.5), P(270, 130), x11.pin('1')]);
  b.wire(al, [P(220, 157.5), P(280, 157.5), P(280, 135), x11.pin('2')]);
  b.wire(al, [x11.pin('3'), P(330, 130), P(330, 60)], { potential: '24VDC' });
  b.wire(al, [x11.pin('4'), P(335, 135), P(335, 200)], { potential: '0V' });
  // PLC interface (page 09): the socket -X10 on the board, the PLC channels, the HMI and the switch.
  const plc = b.addPage('plc', { en: 'PLC interface', it: 'Interfaccia PLC' }, { location: 'DS' });
  const x10 = b.box(plc, { variant: 'connector', x: 55, y: 62, w: 15, h: 20, designation: '-X10', gender: 'socket', mate: '-X11', title: { it: 'Presa', en: 'Socket' }, pins: [['1', 'right', 'K1'], ['2', 'right', 'K2'], ['3', 'left', '24V'], ['4', 'left', '0V']] });
  const di = plcCard(b, plc, { x: 250, y: 45, des: '-A2', type: 'di', slot: 1, n: 8, pitch: 10, w: 44, title: { en: 'Digital inputs 24 V DC', it: 'Ingressi digitali 24 V DC' } });
  const ai = plcCard(b, plc, { x: 250, y: 146, des: '-A5', type: 'ai', slot: 2, n: 8, pitch: 6, w: 44, title: { en: 'Analog inputs', it: 'Ingressi analogici' } });
  plcCard(b, plc, { x: 310, y: 60, des: '-A1', type: 'cpu', slot: 0, n: 0, title: { en: 'PLC CPU', it: 'CPU PLC' } });
  const route = (from: Pt, to: Pt, mx: number) => b.wire(plc, [from, P(mx, from.y), P(mx, to.y), to]);
  route(x10.pin('1'), di.pin('0'), 150);
  route(x10.pin('2'), di.pin('1'), 170);
  b.wire(plc, [x10.pin('3'), P(x10.pin('3').x - 35, x10.pin('3').y)], { potential: '24VDC' });
  b.wire(plc, [x10.pin('4'), P(x10.pin('4').x - 45, x10.pin('4').y), P(x10.pin('4').x - 45, x10.pin('4').y + 25)], { potential: '0V' });
  b.place(plc, 'interruption-point', 170, 152, { value: 'IOUT', mirror: true });
  b.wire(plc, [P(170, 152), ai.pin('0')]);
  b.text(plc, 118, 142, 'Corrente di uscita', { size: 3 });
  plcTags(b, plc, [[di.id, '0', 'K1_Mancanza_rete', 'Mancanza rete'], [di.id, '1', 'K2_Batteria_scarica', 'Batteria scarica'], [ai.id, '0', 'B1_Corrente_uscita', 'Corrente di uscita']]);
  const hmi = b.box(plc, { variant: 'blackbox', x: 55, y: 200, w: 50, h: 30, designation: '-A3', title: { it: 'Pannello operatore HMI', en: 'HMI operator panel' }, pins: [['ETH', 'right', 'RJ45'], ['24V', 'left'], ['0V', 'left']] });
  const sw = b.box(plc, { variant: 'blackbox', x: 185, y: 200, w: 50, h: 30, designation: '-A4', title: { it: 'Switch di rete', en: 'Network switch' }, pins: [['P1', 'left', 'RJ45'], ['P2', 'right', 'RJ45'], ['24V', 'right']] });
  b.wire(plc, [hmi.pin('ETH'), sw.pin('P1')]);
  b.text(plc, 125, 198, 'Cavo patch RJ45 Cat 5', { size: 2.5 });
  b.wire(plc, [hmi.pin('24V'), P(hmi.pin('24V').x - 35, hmi.pin('24V').y)], { potential: '24VDC' });
  b.wire(plc, [hmi.pin('0V'), P(hmi.pin('0V').x - 45, hmi.pin('0V').y)], { potential: '0V' });
  b.wire(plc, [sw.pin('24V'), P(sw.pin('24V').x + 35, sw.pin('24V').y)], { potential: '24VDC' });
  // Flat ribbon cable between the interface board header and the PLC input header.
  b.box(plc, { variant: 'connector', x: 322, y: 195, w: 20, h: 25, designation: '-X20', title: { it: 'Intestazione scheda interfaccia', en: 'Interface board header' }, pins: [['1', 'right', 'K1'], ['2', 'right', 'K2'], ['3', 'right', '24V'], ['4', 'right', '0V']] });
  b.box(plc, { variant: 'connector', x: 372, y: 195, w: 20, h: 25, designation: '-X21', title: { it: 'Intestazione ingressi PLC', en: 'PLC input header' }, pins: [['1', 'left', 'I0.0'], ['2', 'left', 'I0.1'], ['3', 'left', '24V'], ['4', 'left', '0V']] });
  b.text(plc, 346, 192, 'Cavo piatto', { size: 2.5 });
  layoutPage(b, 'it');
  // Parts: several parts per device (a module plus its capacitors), project-level parts without designation.
  b.parts(pw, '-QF1', [['generic-mcb-3p-c32a', 1]]);
  b.parts(pw, '-T1', [['generic-transformer-3ph-dyn11-5kva', 1]]);
  b.parts(pw, '-U1', [['generic-rectifier-module-3ph-110vdc-15a', 1], ['generic-capacitor-electrolytic-4700uf-100v', 2]]);
  b.parts(pw, '-U2', [['generic-rectifier-module-3ph-110vdc-15a', 1], ['generic-capacitor-electrolytic-4700uf-100v', 2]]);
  b.parts(dc, '-F1', [['generic-fuse-holder-dc-63a', 1], ['generic-fuse-link-dc-63a', 1]]);
  b.parts(dc, '-KM1', [['generic-contactor-dc-2p-63a', 1]]);
  b.parts(dc, '-V1', [['generic-diode-power-50a-1600v', 1]]);
  b.parts(dc, '-B1', [['generic-hall-sensor-100a', 1]]);
  b.parts(dc, '-G1', [['generic-battery-cell-2v-100ah', 54]]);
  b.parts(dc, '-P1', [['generic-panel-meter-dc-voltmeter', 1]]);
  b.parts(dc, '-A5', [['generic-din-rail-35mm-1m', 1]]);
  b.parts(al, '-K1', [['generic-phase-monitor-relay-3ph', 1]]);
  b.parts(al, '-K2', [['generic-relay-interface-2co-24vdc', 1]]);
  b.parts(al, '-H1', [['generic-pilot-lamp-22mm-24vdc', 1]]);
  b.parts(al, '-H2', [['generic-pilot-lamp-22mm-24vdc', 1]]);
  b.parts(al, '-X11', [['generic-connector-plug-socket-8pole', 1]]);
  b.parts(plc, '-A1', [['generic-plc-cpu-compact', 1], ['generic-plc-rack-4slot', 1]]);
  b.parts(plc, '-A2', [['generic-plc-di-8-24vdc', 1]]);
  b.parts(plc, '-A5', [['generic-plc-ai-8', 1]]);
  b.parts(plc, '-A3', [['generic-hmi-7in-touch-24vdc', 1]]);
  b.parts(plc, '-A4', [['generic-switch-ethernet-5port-24vdc', 1]]);
  b.parts(plc, '-X10', [['generic-connector-header-10pin', 1]]);
  b.fields(pw, '-T1', { make: 'Acquisto', notes: 'Gruppo vettoriale Dyn11' });
  b.fields(dc, '-G1', { make: 'Acquisto' });
  b.projectPart('generic-enclosure-800x1000x300', 1, { make: 'Acquisto' });
  b.projectPart('generic-mounting-plate-600x800', 1, { make: 'Acquisto' });
  b.projectPart('generic-wiring-kit', 1, { make: 'Produzione' });
  b.projectPart('generic-din-rail-35mm-1m', 3);
  b.projectPart('generic-terminal-feedthrough-4mm2', 20);
  b.projectPart('generic-terminal-pe-4mm2', 6);
  b.projectPart('generic-cable-duct-60x60-2m', 4);
  b.parts(dc, '-X1', [['generic-terminal-feedthrough-6mm2', 1], ['generic-terminal-end-plate', 1], ['generic-terminal-end-stop', 2]]);
  b.parts(plc, '-X20', [['generic-connector-header-10pin', 1]]);
  b.parts(plc, '-X21', [['generic-connector-header-10pin', 1]]);
  for (const id of ['generic-cable-ribbon-flat-10pole', 'generic-cable-patch-rj45-cat5e']) b.run({ type: 'part/embed', def: lib.parts.get(id)! });
  b.run({ type: 'cable/set', cable: { id: '-W1', kind: 'ribbon', part: 'generic-cable-ribbon-flat-10pole', from: '-X20', to: '-X21', length: '0,3 m', functionText: { it: 'Cavo piatto interfaccia PLC', en: 'PLC interface ribbon cable' } } });
  b.run({ type: 'cable/set', cable: { id: '-W2', kind: 'patch', part: 'generic-cable-patch-rj45-cat5e', from: '-A3:ETH', to: '-A4:P1', length: '2 m', functionText: { it: 'Collegamento HMI - switch', en: 'HMI to switch link' } } });
  b.fields(pw, '-QF1', { nameplate: 'Ingresso c.a.\nalimentazione ausiliari' });
  b.fields(dc, '-F1', { nameplate: 'Fusibile batteria\n63 A DC' });
  finishSample(b, lib, ['terminals', 'cables'], ['wires', 'pins', 'bom', 'legend', 'colours', 'suffixes', 'torque', 'nameplates', 'plcIo']);
  // A real production set: revision 0 went out for approval; revision 1 changes the battery string, which changes the DC page and the BOM.
  issue(b, '0', '2026-09-15', 'Prima emissione per approvazione', 'approval', { drawn: 'CablePilot', checked: 'Ufficio tecnico', approved: '' });
  const noteEl = b.project.pages.find((p) => p.id === dc)!.elements.find((e) => e.kind === 'text' && e.text.startsWith('Batteria:'))!;
  b.run({ type: 'el/update', page: dc, id: noteEl.id, patch: { text: 'Batteria: 55 elementi al piombo da 2 V in serie (110 V).\nIl sensore -B1 misura la corrente di uscita (segnale IOUT).' } });
  b.parts(dc, '-G1', [['generic-battery-cell-2v-100ah', 55]]);
  issue(b, '1', '2026-10-24', 'Batteria portata a 55 elementi (110 V)', 'construction', { drawn: 'CablePilot', checked: 'Ufficio tecnico', approved: 'Direzione' });
  return b.project;
}

/** An alarm relay stage (coil, contact, lamp between a 24 V rail and a 0 V rail 140 mm apart), saved as a library macro. */
export function alarmStageMacro(lib: Library): MacroDef {
  const b = builder(lib, 'macro-scratch', 'Macro scratch');
  const pg = b.addPage('control', { en: 'Scratch' });
  const coil = b.place(pg, 'coil', 10, 40, { designation: '-K1', functionText: { en: 'Alarm relay', it: 'Relè di allarme' } });
  const k = b.place(pg, 'contact-no', 40, 80, { designation: '-K1', functionText: { en: 'Alarm contact', it: 'Contatto di allarme' } });
  const h = b.place(pg, 'lamp', 40, 110, { designation: '-H1', functionText: { en: 'Alarm indication', it: 'Segnalazione di allarme' } });
  b.wire(pg, [P(10, 0), coil.pin('A1')]);
  b.wire(pg, [coil.pin('A2'), P(10, 140)]);
  b.wire(pg, [P(40, 0), k.pin('1')]);
  b.wire(pg, [k.pin('2'), h.pin('1')]);
  b.wire(pg, [h.pin('2'), P(40, 140)]);
  const m = macroFromSelection(b.project.pages[0], b.project.pages[0].elements.map((e) => e.id), { id: 'alarm-relay-stage', title: { en: 'Alarm relay stage (coil, contact, lamp)', it: 'Stadio relè di allarme (bobina, contatto, spia)' }, category: 'control' });
  if (!m) throw new Error('macro');
  return { ...m, source: 'CablePilot example macro: generic symbols only, drawn for the sample projects', verification: 'secondary', verifiedFrom: 'Example macro drawn by CablePilot; the symbols it uses carry their own sources (docs/to-verify.md)' };
}

/** Macros shipped in /library/macros, generated from the same commands as the editor. */
export const MACROS = [{ file: 'alarm-relay-stage', build: alarmStageMacro }] as const;

export const SAMPLES = [
  { file: 'conveyor', build: conveyorSample },
  { file: 'pump-station', build: pumpSample },
  { file: 'dc-charger', build: chargerSample },
] as const;
