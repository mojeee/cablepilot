// The sample projects (demo mode, product rule 10). They are built here with the same commands the
// app uses, then written to /samples by tests/samples.test.ts (UPDATE_SAMPLES=1). Generic parts and
// invented example data only: nothing from any third-party drawing.
import { FORM_PRESETS } from '@shared/forms';
import type { Library } from '@shared/library/types';
import type { Pt } from '@shared/model/types';
import { frameRect } from '@shared/draw/page';
import { templateOf } from '@shared/model/queries';
import { sheetMm } from '@shared/sheets';
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
const blankPages = (b: B, lang: 'en' | 'it') => {
  const msg = lang === 'it' ? 'Questa pagina si compila dagli schemi con le funzioni dei report (milestone M3 e M6).' : 'This page is filled from the schematic by the report and layout features (milestones M3 and M6).';
  for (const [type, en, it] of [['terminals', 'Terminals', 'Morsettiere'], ['cables', 'Cables', 'Cavi'], ['layout', 'Cabinet layout', 'Layout quadro']] as const) {
    const id = b.addPage(type, { en, it });
    note(b, id, 40, 40, msg);
  }
};

export function conveyorSample(lib: Library) {
  const b = builder(lib, 'sample-conveyor', 'Conveyor with direct-on-line starter', { drawingLanguage: 'en' });
  b.set({
    properties: { client: 'Example Conveyors Ltd', product: 'Belt conveyor C1, 5.5 kW', orderNo: 'SAMPLE-0001', drawingNo: 'SMP-CNV-001', drawn: 'CablePilot', checked: '', approved: '', issueDate: '2026-10-24', revision: 'A', copyright: 'Sample project of CablePilot (Apache-2.0). Example data only.' },
    assembly: { ratedOperationalVoltage: '400', ratedInsulationVoltage: '690', ratedImpulseVoltage: '6', ratedCurrent: '32', ratedShortTimeCurrent: '10', ratedFrequency: '50', ratedDiversityFactor: '1', earthingSystem: 'TN-S', formOfSeparation: '1', ipDegree: 'IP54', installation: 'indoor', mobility: 'fixed', enclosureMaterial: 'Sheet steel, powder coated' },
  });
  b.addPage('cover', { en: 'Cover sheet' });
  b.addPage('contents', { en: 'Contents' });
  dataPage(b, 'iec61439-general', { en: 'General data of the assembly', it: "Dati generali dell'assieme" });
  // Single-line overview with conductor tick marks.
  const sl = b.addPage('singleLine', { en: 'Single-line diagram' }, { location: 'DS' });
  const q = b.place(sl, 'mcb-1p', 100, 60, { designation: '-QF1', functionText: { en: 'Main breaker 32 A' } });
  const k = b.place(sl, 'contact-no', 100, 90, { designation: '-KM1', functionText: { en: 'Contactor' } });
  const m = b.place(sl, 'motor-3ph', 100, 130, { designation: '-M1', functionText: { en: 'Conveyor motor\n5.5 kW' } });
  b.wire(sl, [P(100, 30), q.pin('1')], { conductors: 3, potential: 'L1' });
  b.wire(sl, [q.pin('2'), k.pin('1')], { conductors: 3 });
  b.wire(sl, [k.pin('2'), P(100, 100), P(100, 110), m.pin('V')].filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y), { conductors: 3 });
  b.text(sl, 40, 30, 'Mains 400 V 3~ 50 Hz', { size: 3.5 });
  b.rect(sl, 70, 45, 70, 110, { dashed: true, label: 'Conveyor starter' });
  b.warning(sl, 170, 60, 'electric');
  // Power circuit.
  const pw = b.addPage('power', { en: 'Motor power circuit' }, { location: 'DS' });
  const qs = b.place(pw, 'switch-disconnector-3p', 100, 50, { designation: '-QS1', functionText: { en: 'Main isolator' } });
  const qf = b.place(pw, 'mcb-3p', 100, 70, { designation: '-QF1', functionText: { en: 'Motor circuit breaker' } });
  const km = b.place(pw, 'contactor-3p', 100, 90, { designation: '-KM1', functionText: { en: 'Conveyor contactor' } });
  const fr = b.place(pw, 'overload-relay-3p', 100, 110, { designation: '-FR1', functionText: { en: 'Overload relay' } });
  const mo = b.place(pw, 'motor-3ph', 100, 145, { designation: '-M1', functionText: { en: 'Conveyor motor\n5.5 kW 400 V' } });
  let n = 0;
  const num = () => String(++n);
  [95, 100, 105].forEach((x, i) => b.wire(pw, [P(x, 25), qs.pin(['1', '3', '5'][i])], { potential: L3[i] }));
  link3(b, pw, qs, qf, undefined, undefined, num);
  link3(b, pw, qf, km, undefined, undefined, num);
  link3(b, pw, km, fr, undefined, undefined, num);
  link3(b, pw, fr, mo, ['U', 'V', 'W'], undefined, num);
  b.rect(pw, 80, 40, 60, 90, { dashed: true, label: 'Starter' });
  b.warning(pw, 60, 50, 'electric');
  note(b, pw, 160, 60, 'Motor starter, direct on line.\nProtection: motor circuit breaker\nand overload relay.');
  // Control circuit.
  const ct = b.addPage('control', { en: 'Control circuit 24 V DC' }, { location: 'DS' });
  const g = b.place(ct, 'power-supply', 50, 50, { mirror: true, functionText: { en: 'Power supply 24 V' } });
  b.wire(ct, [P(g.pin('N').x, 25), g.pin('N')], { potential: 'N' });
  b.wire(ct, [P(g.pin('L').x, 25), g.pin('L')], { potential: 'L1' });
  b.wire(ct, [g.pin('+'), P(g.pin('+').x, 70), P(190, 70)], { potential: '24VDC' });
  const zero = b.wire(ct, [g.pin('-'), P(g.pin('-').x, 240), P(190, 240)], { potential: '0V' });
  void zero;
  const s0 = b.place(ct, 'emergency-stop', 100, 90, { designation: '-S0', functionText: { en: 'Emergency stop' } });
  const s2 = b.place(ct, 'pushbutton-nc', 100, 110, { designation: '-S2', functionText: { en: 'Stop' } });
  const s1 = b.place(ct, 'pushbutton-no', 100, 130, { designation: '-S1', functionText: { en: 'Start' } });
  const f1 = b.place(ct, 'contact-nc', 100, 150, { designation: '-FR1', functionText: { en: 'Overload relay' } });
  const c1 = b.place(ct, 'coil', 100, 175, { designation: '-KM1', functionText: { en: 'Conveyor contactor' } });
  b.wire(ct, [P(100, 70), s0.pin('1')]);
  b.wire(ct, [s0.pin('2'), s2.pin('1')]);
  b.wire(ct, [s2.pin('2'), s1.pin('3')]);
  b.wire(ct, [s1.pin('4'), f1.pin('1')]);
  b.wire(ct, [f1.pin('2'), c1.pin('A1')]);
  b.wire(ct, [c1.pin('A2'), P(100, 240)]);
  const hold = b.place(ct, 'contact-no', 115, 130, { designation: '-KM1', functionText: { en: 'Self-hold' } });
  b.wire(ct, [P(100, 120), P(115, 120), hold.pin('1')]);
  b.wire(ct, [hold.pin('2'), P(115, 140), P(100, 140)]);
  const lampC = b.place(ct, 'contact-no', 145, 150, { designation: '-KM1', functionText: { en: 'Run' } });
  const h1 = b.place(ct, 'lamp', 145, 180, { designation: '-H1', functionText: { en: 'Conveyor running' } });
  b.wire(ct, [P(145, 70), lampC.pin('1')]);
  b.wire(ct, [lampC.pin('2'), h1.pin('1')]);
  b.wire(ct, [h1.pin('2'), P(145, 240)]);
  note(b, ct, 170, 100, 'Start and stop with the pushbuttons.\nThe emergency stop opens the\ncontrol circuit.');
  // PLC page.
  const plc = b.addPage('plc', { en: 'PLC inputs and outputs' }, { location: 'DS' });
  const io: [string, string, string, 'plc-input' | 'plc-output'][] = [['I0.0', 'Emergency stop healthy', '-S0', 'plc-input'], ['I0.1', 'Start', '-S1', 'plc-input'], ['I0.2', 'Stop', '-S2', 'plc-input'], ['Q0.0', 'Conveyor contactor', '-KM1', 'plc-output'], ['Q0.1', 'Running lamp', '-H1', 'plc-output']];
  io.forEach(([addr, sig, , sym], i) => {
    const ch = b.place(plc, sym, 120, 50 + i * 12, { value: addr });
    b.wire(plc, [P(100, 50 + i * 12), ch.pin('1')]);
    b.text(plc, 40, 51.5 + i * 12, sig, { size: 3 });
  });
  b.rect(plc, 118, 42, 25, 66, { dashed: true, label: 'PLC' });
  b.run({ type: 'el/add', page: plc, elements: [{ id: b.nid(), kind: 'table', x: 170, y: 50, colWidths: [20, 55, 20], rowHeight: 7, size: 3, headerRow: true, cells: [['Address', 'Signal', 'Device'], ...io.map(([a, s, d]) => [a, s, d])] }] });
  blankPages(b, 'en');
  return b.project;
}

export function pumpSample(lib: Library) {
  const b = builder(lib, 'sample-pump-station', 'Pump station, two pumps', { drawingLanguage: 'en' });
  b.set({
    properties: { client: 'Example Water Utility', product: 'Pump station PS1, 2 x 7.5 kW', orderNo: 'SAMPLE-0002', drawingNo: 'SMP-PMP-001', drawn: 'CablePilot', issueDate: '2026-10-24', revision: 'A', copyright: 'Sample project of CablePilot (Apache-2.0). Example data only.' },
    assembly: { ratedOperationalVoltage: '400', ratedInsulationVoltage: '690', ratedImpulseVoltage: '6', ratedCurrent: '63', ratedShortTimeCurrent: '10', ratedFrequency: '50', ratedDiversityFactor: '0.8', earthingSystem: 'TT', formOfSeparation: '2b', ipDegree: 'IP55', installation: 'outdoor', mobility: 'fixed', enclosureMaterial: 'Stainless steel' },
  });
  b.addPage('cover', { en: 'Cover sheet' });
  b.addPage('contents', { en: 'Contents' });
  dataPage(b, 'iec61439-general', { en: 'General data of the assembly', it: "Dati generali dell'assieme" });
  const sl = b.addPage('singleLine', { en: 'Single-line diagram' }, { location: 'PS' });
  const q0 = b.place(sl, 'mcb-1p', 100, 55, { designation: '-QF0', functionText: { en: 'Incomer 63 A' } });
  b.wire(sl, [P(100, 30), q0.pin('1')], { conductors: 3, potential: 'L1' });
  b.wire(sl, [q0.pin('2'), P(100, 70), P(160, 70)], { conductors: 3 });
  [[100, 'Pump 1'], [160, 'Pump 2']].forEach(([x, name], i) => {
    const q = b.place(sl, 'mcb-1p', x as number, 90, { designation: `-QF${i + 1}`, functionText: { en: `Pump ${i + 1} breaker 16 A` } });
    const k = b.place(sl, 'contact-no', x as number, 115, { designation: `-KM${i + 1}` });
    const m = b.place(sl, 'motor-3ph', x as number, 150, { designation: `-M${i + 1}`, functionText: { en: `${name as string}\n7.5 kW` } });
    b.wire(sl, [P(x as number, 70), q.pin('1')], { conductors: 3 });
    b.wire(sl, [q.pin('2'), k.pin('1')], { conductors: 3 });
    b.wire(sl, [k.pin('2'), m.pin('V')], { conductors: 3 });
  });
  const pw = b.addPage('power', { en: 'Pump power circuits' }, { location: 'PS' });
  let n = 0;
  const num = () => String(++n);
  [100, 190].forEach((x, i) => {
    const qf = b.place(pw, 'mcb-3p', x, 60, { designation: `-QF${i + 1}`, functionText: { en: `Pump ${i + 1} breaker` } });
    const km = b.place(pw, 'contactor-3p', x, 80, { designation: `-KM${i + 1}`, functionText: { en: `Pump ${i + 1} contactor` } });
    const fr = b.place(pw, 'overload-relay-3p', x, 100, { designation: `-FR${i + 1}`, functionText: { en: 'Overload relay' } });
    const mo = b.place(pw, 'motor-3ph', x, 135, { designation: `-M${i + 1}`, functionText: { en: `Pump ${i + 1}\n7.5 kW` } });
    [-5, 0, 5].forEach((dx, j) => b.wire(pw, [P(x + dx, 30), qf.pin(['1', '3', '5'][j])], { potential: L3[j] }));
    link3(b, pw, qf, km, undefined, undefined, num);
    link3(b, pw, km, fr, undefined, undefined, num);
    link3(b, pw, fr, mo, ['U', 'V', 'W'], undefined, num);
  });
  note(b, pw, 40, 190, 'Star-delta starters for the pumps need devices with several contact sets: they come with milestone M2.');
  const ct = b.addPage('control', { en: 'Level control' }, { location: 'PS' });
  const top = b.wire(ct, [P(60, 60), P(200, 60)], { potential: '24VDC' });
  void top;
  const cols = [[90, 'Low level start', 'limit-switch-no'], [140, 'High level stop', 'limit-switch-nc']] as const;
  b.wire(ct, [P(60, 200), P(200, 200)], { potential: '0V' });
  cols.forEach(([x, text, sym]) => {
    const s = b.place(ct, sym, x, 90, { designation: x === 90 ? '-BL1' : '-BL2', functionText: { en: text } });
    const c = b.place(ct, 'coil', x, 140, { designation: x === 90 ? '-KM1' : '-KM2', functionText: { en: x === 90 ? 'Pump 1 contactor' : 'Pump 2 contactor' } });
    b.wire(ct, [P(x, 60), s.pin(sym === 'limit-switch-no' ? '3' : '1')]);
    b.wire(ct, [s.pin(sym === 'limit-switch-no' ? '4' : '2'), c.pin('A1')]);
    b.wire(ct, [c.pin('A2'), P(x, 200)]);
  });
  const plc = b.addPage('plc', { en: 'PLC interface' }, { location: 'PS' });
  const io: [string, string][] = [['I0.0', 'Low level'], ['I0.1', 'High level'], ['I0.2', 'Pump 1 overload'], ['Q0.0', 'Pump 1 contactor'], ['Q0.1', 'Pump 2 contactor']];
  io.forEach(([a, sig], i) => {
    const ch = b.place(plc, a.startsWith('I') ? 'plc-input' : 'plc-output', 120, 50 + i * 12, { value: a });
    b.wire(plc, [P(100, 50 + i * 12), ch.pin('1')]);
    b.text(plc, 40, 51.5 + i * 12, sig, { size: 3 });
  });
  b.rect(plc, 118, 42, 25, 66, { dashed: true, label: 'PLC' });
  blankPages(b, 'en');
  return b.project;
}

export function chargerSample(lib: Library) {
  const b = builder(lib, 'sample-dc-charger', 'Caricabatterie 110 V DC', { drawingLanguage: 'it' });
  b.set({
    properties: { client: 'Cliente di esempio S.r.l.', product: 'Quadro caricabatterie 110 V DC', orderNo: 'ESEMPIO-0003', drawingNo: 'SMP-CHG-001', drawn: 'CablePilot', issueDate: '2026-10-24', revision: 'A', copyright: 'Progetto di esempio di CablePilot (Apache-2.0). Solo dati di esempio.' },
    assembly: { ratedOperationalVoltage: '400', ratedInsulationVoltage: '690', ratedImpulseVoltage: '6', ratedCurrent: '40', ratedShortTimeCurrent: '10', ratedFrequency: '50', ratedDiversityFactor: '1', earthingSystem: 'TN-S', formOfSeparation: '1', ipDegree: 'IP31', installation: 'indoor', mobility: 'fixed', enclosureMaterial: 'Lamiera di acciaio verniciata', dcOutputVoltage: '110', dcOutputCurrent: '30', batteryType: 'Piombo-acido ermetico', batteryNominalVoltage: '110', batteryCapacity: '100' },
  });
  b.addPage('cover', { en: 'Cover sheet', it: 'Copertina' });
  b.addPage('contents', { en: 'Contents', it: 'Indice' });
  dataPage(b, 'iec61439-general', { en: 'General data of the assembly', it: "Dati generali dell'assieme" });
  dataPage(b, 'battery-dc', { en: 'Battery and DC output data', it: 'Dati batteria e uscita DC' });
  // Single-line overview.
  const sl = b.addPage('singleLine', { en: 'Single-line diagram', it: 'Schema unifilare' }, { location: 'DS' });
  const qf = b.place(sl, 'mcb-1p', 80, 55, { designation: '-QF1', functionText: { it: 'Interruttore di ingresso', en: 'Input breaker' } });
  const tr = b.place(sl, 'transformer-3ph', 80, 95, { designation: '-T1', functionText: { it: 'Trasformatore\nDyn11', en: 'Transformer\nDyn11' } });
  b.wire(sl, [P(80, 30), qf.pin('1')], { conductors: 3, potential: 'L1' });
  b.wire(sl, [qf.pin('2'), P(80, 70), P(80, 80), tr.pin('1V')].filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y), { conductors: 3 });
  const r1 = b.place(sl, 'rectifier-3ph', 60, 150, { designation: '-U1', functionText: { it: 'Modulo raddrizzatore 1', en: 'Rectifier module 1' } });
  const r2 = b.place(sl, 'rectifier-3ph', 120, 150, { designation: '-U2', functionText: { it: 'Modulo raddrizzatore 2', en: 'Rectifier module 2' } });
  b.wire(sl, [tr.pin('2V'), P(80, 112), P(60, 112), r1.pin('L2')], { conductors: 3 });
  b.wire(sl, [P(80, 112), P(120, 112), r2.pin('L2')], { conductors: 3 });
  b.rect(sl, 40, 125, 55, 55, { dashed: true });
  b.rect(sl, 100, 125, 55, 55, { dashed: true });
  b.place(sl, 'battery', 200, 190, { designation: '-G1', functionText: { it: 'Batteria 110 V', en: 'Battery 110 V' } });
  b.wire(sl, [r1.pin('DC+'), P(r1.pin('DC+').x, 185), P(200, 185), P(200, 182.5)], { conductors: 2, potential: 'L+' });
  b.wire(sl, [r2.pin('DC+'), P(r2.pin('DC+').x, 185)]);
  b.warning(sl, 250, 60, 'electric');
  b.text(sl, 150, 60, 'Alimentazione 400 V 3~ 50 Hz\nUscita 110 V DC', { size: 3.5 });
  // Power: input and rectifiers.
  const pw = b.addPage('power', { en: 'Input and rectifier modules', it: 'Ingresso e moduli raddrizzatori' }, { location: 'DS' });
  let n = 0;
  const num = () => String(++n).padStart(3, '0');
  const q1 = b.place(pw, 'mcb-3p', 60, 60, { designation: '-QF1', functionText: { it: 'Interruttore di ingresso', en: 'Input breaker' } });
  const t1 = b.place(pw, 'transformer-3ph', 60, 95, { designation: '-T1', functionText: { it: 'Trasformatore trifase', en: 'Three-phase transformer' } });
  [55, 60, 65].forEach((x, i) => b.wire(pw, [P(x, 30), q1.pin(['1', '3', '5'][i])], { potential: L3[i] }));
  link3(b, pw, q1, t1, ['1U', '1V', '1W'], ['2', '4', '6'], num);
  const u1 = b.place(pw, 'rectifier-3ph', 60, 135, { designation: '-U1', functionText: { it: 'Modulo raddrizzatore 1', en: 'Rectifier module 1' } });
  const u2 = b.place(pw, 'rectifier-3ph', 110, 135, { designation: '-U2', functionText: { it: 'Modulo raddrizzatore 2', en: 'Rectifier module 2' } });
  ['2U', '2V', '2W'].forEach((p, i) => b.wire(pw, [t1.pin(p), u1.pin(L3[i])], { number: `${num()}${'LMN'[i]}` }));
  b.wire(pw, [P(55, 116), P(105, 116), u2.pin('L1')]);
  b.wire(pw, [P(60, 112), P(110, 112), u2.pin('L2')]);
  b.wire(pw, [P(65, 108), P(115, 108), u2.pin('L3')]);
  b.wire(pw, [u1.pin('DC-'), P(u1.pin('DC-').x, 160), P(225, 160), P(225, 185), P(190, 185)], { potential: 'L-' });
  b.wire(pw, [u2.pin('DC-'), P(u2.pin('DC-').x, 160)]);
  b.place(pw, 'battery', 190, 177.5, { designation: '-G1', functionText: { it: 'Batteria 110 V', en: 'Battery 110 V' } });
  const fu = b.place(pw, 'fuse', 160, 170, { rot: 90, designation: '-F1', functionText: { it: 'Fusibile batteria', en: 'Battery fuse' } });
  b.wire(pw, [u1.pin('DC+'), P(u1.pin('DC+').x, 170), fu.pin('2')], { potential: 'L+' });
  b.wire(pw, [u2.pin('DC+'), P(u2.pin('DC+').x, 170)]);
  b.wire(pw, [fu.pin('1'), P(215, 170)]);
  const vm = b.place(pw, 'voltmeter', 215, 165, { designation: '-P1', functionText: { it: 'Tensione batteria', en: 'Battery voltage' } });
  void vm;
  b.rect(pw, 40, 120, 40, 50, { dashed: true });
  b.rect(pw, 90, 120, 40, 50, { dashed: true });
  b.warning(pw, 20 + 20, 75, 'electric');
  note(b, pw, 140, 80, 'Uscita 110 V DC, 30 A.\nI due moduli lavorano in parallelo.');
  // Alarm relays.
  const al = b.addPage('control', { en: 'Alarm relays', it: 'Relè di allarme' }, { location: 'DS' });
  b.wire(al, [P(60, 60), P(200, 60)], { potential: '24VDC' });
  b.wire(al, [P(60, 200), P(200, 200)], { potential: '0V' });
  ([[90, 'Mancanza rete', 'Mains failure'], [160, 'Batteria scarica', 'Battery low']] as const).forEach(([x, it, en], i) => {
    const c = b.place(al, 'coil', x, 100, { designation: `-K${i + 1}`, functionText: { it: `Relè ${it}`, en: `Relay ${en}` } });
    b.wire(al, [P(x, 60), c.pin('A1')]);
    b.wire(al, [c.pin('A2'), P(x, 200)]);
    const k = b.place(al, 'contact-no', x + 30, 140, { designation: `-K${i + 1}`, functionText: { it, en } });
    const h = b.place(al, 'lamp', x + 30, 175, { designation: `-H${i + 1}`, functionText: { it: `Segnalazione ${it.toLowerCase()}`, en: `${en} indication` } });
    b.wire(al, [P(x + 30, 60), k.pin('1')]);
    b.wire(al, [k.pin('2'), h.pin('1')]);
    b.wire(al, [h.pin('2'), P(x + 30, 200)]);
  });
  // PLC interface.
  const plc = b.addPage('plc', { en: 'PLC interface', it: 'Interfaccia PLC' }, { location: 'DS' });
  const io: [string, string, string][] = [['I0.0', 'Mancanza rete', '-K1'], ['I0.1', 'Batteria scarica', '-K2'], ['I0.2', 'Interruttore ingresso aperto', '-Q1']];
  io.forEach(([a, s], i) => {
    const ch = b.place(plc, 'plc-input', 120, 50 + i * 12, { value: a });
    b.wire(plc, [P(100, 50 + i * 12), ch.pin('1')]);
    b.text(plc, 40, 51.5 + i * 12, s, { size: 3 });
  });
  b.rect(plc, 118, 42, 25, 42, { dashed: true, label: 'PLC' });
  b.run({ type: 'el/add', page: plc, elements: [{ id: b.nid(), kind: 'table', x: 170, y: 50, colWidths: [20, 60, 20], rowHeight: 7, size: 3, headerRow: true, cells: [['Indirizzo', 'Segnale', 'Dispositivo'], ...io.map(([a, s, d]) => [a, s, d])] }] });
  blankPages(b, 'it');
  return b.project;
}

export const SAMPLES = [
  { file: 'conveyor', build: conveyorSample },
  { file: 'pump-station', build: pumpSample },
  { file: 'dc-charger', build: chargerSample },
] as const;
