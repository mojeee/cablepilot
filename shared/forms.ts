// Project data: the fields of the title block, the assembly data of IEC 61439, and the form
// presets drawn on project data pages. Values live in `project.properties` and `project.assembly`;
// a form on a page only points at them (rule 1: nothing is typed twice).
//
// Sources: assembly interface characteristics follow IEC 61439-1, clause 5 (rated voltages, rated
// current, short-time withstand current, rated frequency, diversity factor) and the user
// specification of Annex C (earthing system, form of separation, IP degree, installation).
// The clause list was taken from secondary sources: see docs/to-verify.md.

import type { FormItem, LText } from './model/types';

export interface DataField {
  key: string;
  label: LText & { en: string; it: string };
  kind: 'text' | 'choice';
  options?: string[];
  unit?: string;
}

export const PROJECT_FIELDS: DataField[] = [
  { key: 'client', label: { en: 'Client', it: 'Cliente' }, kind: 'text' },
  { key: 'product', label: { en: 'Product', it: 'Prodotto' }, kind: 'text' },
  { key: 'orderNo', label: { en: 'Order no.', it: 'N. commessa' }, kind: 'text' },
  { key: 'drawingNo', label: { en: 'Drawing no.', it: 'N. disegno' }, kind: 'text' },
  { key: 'drawn', label: { en: 'Drawn by', it: 'Disegnato da' }, kind: 'text' },
  { key: 'checked', label: { en: 'Checked by', it: 'Controllato da' }, kind: 'text' },
  { key: 'approved', label: { en: 'Approved by', it: 'Approvato da' }, kind: 'text' },
  { key: 'issueDate', label: { en: 'Issue date', it: 'Data emissione' }, kind: 'text' },
  { key: 'revision', label: { en: 'Revision', it: 'Revisione' }, kind: 'text' },
  { key: 'copyright', label: { en: 'Margin text (copyright)', it: 'Testo a margine (copyright)' }, kind: 'text' },
];

export const ASSEMBLY_FIELDS: DataField[] = [
  { key: 'ratedOperationalVoltage', label: { en: 'Rated operational voltage Ue', it: 'Tensione nominale di impiego Ue' }, kind: 'text', unit: 'V' },
  { key: 'ratedInsulationVoltage', label: { en: 'Rated insulation voltage Ui', it: 'Tensione nominale di isolamento Ui' }, kind: 'text', unit: 'V' },
  { key: 'ratedImpulseVoltage', label: { en: 'Rated impulse withstand voltage Uimp', it: 'Tensione nominale di tenuta a impulso Uimp' }, kind: 'text', unit: 'kV' },
  { key: 'ratedCurrent', label: { en: 'Rated current of the assembly InA', it: "Corrente nominale dell'assieme InA" }, kind: 'text', unit: 'A' },
  { key: 'ratedShortTimeCurrent', label: { en: 'Rated short-time withstand current Icw', it: 'Corrente nominale di breve durata Icw' }, kind: 'text', unit: 'kA' },
  { key: 'ratedFrequency', label: { en: 'Rated frequency', it: 'Frequenza nominale' }, kind: 'text', unit: 'Hz' },
  { key: 'ratedDiversityFactor', label: { en: 'Rated diversity factor RDF', it: 'Fattore di contemporaneità nominale RDF' }, kind: 'text' },
  { key: 'earthingSystem', label: { en: 'Earthing system', it: 'Sistema di distribuzione' }, kind: 'choice', options: ['TN-S', 'TN-C', 'TN-C-S', 'TT', 'IT'] },
  { key: 'formOfSeparation', label: { en: 'Form of internal separation', it: 'Forma di segregazione interna' }, kind: 'choice', options: ['1', '2a', '2b', '3a', '3b', '4a', '4b'] },
  { key: 'ipDegree', label: { en: 'Degree of protection (IP)', it: 'Grado di protezione (IP)' }, kind: 'text' },
  { key: 'installation', label: { en: 'Installation', it: 'Installazione' }, kind: 'choice', options: ['indoor', 'outdoor'] },
  { key: 'mobility', label: { en: 'Type of assembly', it: 'Tipo di assieme' }, kind: 'choice', options: ['fixed', 'movable'] },
  { key: 'enclosureMaterial', label: { en: 'Enclosure material', it: 'Materiale del contenitore' }, kind: 'text' },
  { key: 'dcOutputVoltage', label: { en: 'DC output voltage', it: 'Tensione di uscita DC' }, kind: 'text', unit: 'V' },
  { key: 'dcOutputCurrent', label: { en: 'DC output current', it: 'Corrente di uscita DC' }, kind: 'text', unit: 'A' },
  { key: 'batteryType', label: { en: 'Battery type', it: 'Tipo di batteria' }, kind: 'text' },
  { key: 'batteryNominalVoltage', label: { en: 'Battery nominal voltage', it: 'Tensione nominale batteria' }, kind: 'text', unit: 'V' },
  { key: 'batteryCapacity', label: { en: 'Battery capacity', it: 'Capacità batteria' }, kind: 'text', unit: 'Ah' },
];

const L = (en: string, it: string): LText => ({ en, it });
const row = (key: string) => {
  const f = ASSEMBLY_FIELDS.find((x) => x.key === key);
  if (!f) throw new Error(`unknown assembly field ${key}`);
  return { label: f.label, bind: `assembly.${key}` };
};
const ticks = (key: string, options: { value: string; label: LText }[]): FormItem[] =>
  options.map((o) => ({ type: 'tick' as const, label: o.label, bind: `assembly.${key}`, value: o.value }));

export interface FormPreset {
  id: string;
  title: LText & { en: string; it: string };
  items: FormItem[];
}

export const FORM_PRESETS: FormPreset[] = [
  {
    id: 'iec61439-general',
    title: L('General data of the assembly (IEC 61439)', "Dati generali dell'assieme (IEC 61439)") as FormPreset['title'],
    items: [
      { type: 'heading', label: L('Electrical data', 'Dati elettrici') },
      { type: 'table', label: L('Rated data', 'Dati nominali'), rows: ['ratedOperationalVoltage', 'ratedInsulationVoltage', 'ratedImpulseVoltage', 'ratedCurrent', 'ratedShortTimeCurrent', 'ratedFrequency', 'ratedDiversityFactor'].map(row) },
      { type: 'heading', label: L('Earthing system', 'Sistema di distribuzione') },
      ...ticks('earthingSystem', ['TN-S', 'TN-C', 'TN-C-S', 'TT', 'IT'].map((v) => ({ value: v, label: L(v, v) }))),
      { type: 'heading', label: L('Mechanical data', 'Dati meccanici') },
      { type: 'text', ...row('ipDegree') },
      { type: 'text', ...row('enclosureMaterial') },
      ...ticks('installation', [{ value: 'indoor', label: L('Indoor', 'Interno') }, { value: 'outdoor', label: L('Outdoor', 'Esterno') }]),
      ...ticks('mobility', [{ value: 'fixed', label: L('Fixed assembly', 'Assieme fisso') }, { value: 'movable', label: L('Movable assembly', 'Assieme mobile') }]),
      { type: 'heading', label: L('Form of internal separation', 'Forma di segregazione interna') },
      ...ticks('formOfSeparation', ['1', '2a', '2b', '3a', '3b', '4a', '4b'].map((v) => ({ value: v, label: L(`Form ${v}`, `Forma ${v}`) }))),
    ],
  },
  {
    id: 'battery-dc',
    title: L('Battery and DC output data', 'Dati batteria e uscita DC') as FormPreset['title'],
    items: [
      { type: 'heading', label: L('DC output', 'Uscita DC') },
      { type: 'table', label: L('DC data', 'Dati DC'), rows: ['dcOutputVoltage', 'dcOutputCurrent'].map(row) },
      { type: 'heading', label: L('Battery', 'Batteria') },
      { type: 'table', label: L('Battery data', 'Dati batteria'), rows: ['batteryType', 'batteryNominalVoltage', 'batteryCapacity'].map(row) },
    ],
  },
];

/** Value of a bind path: "properties.client" or "assembly.ratedCurrent". Unknown: ''. */
export function bindValue(bind: string, properties: Record<string, string>, assembly: Record<string, string>): string {
  const [scope, ...rest] = bind.split('.');
  const key = rest.join('.');
  if (scope === 'assembly') return assembly[key] ?? '';
  if (scope === 'properties') return properties[key] ?? '';
  return '';
}
