// Texts printed on drawings. They follow the project's drawing language (a project setting),
// not the UI language, so an English-speaking engineer can draw an Italian set. The UI strings
// are in shared/i18n; this file is only for text that ends up on paper.

import type { Lang } from './i18n';
import type { LText } from './model/types';

export const DRAWING_TEXT = {
  client: { en: 'Client', it: 'Cliente' },
  product: { en: 'Product', it: 'Prodotto' },
  orderNo: { en: 'Order no.', it: 'N. commessa' },
  drawingNo: { en: 'Drawing no.', it: 'N. disegno' },
  sheetTitle: { en: 'Sheet title', it: 'Titolo foglio' },
  drawn: { en: 'Drawn', it: 'Disegnato' },
  checked: { en: 'Checked', it: 'Controllato' },
  approved: { en: 'Approved', it: 'Approvato' },
  issueDate: { en: 'Issue date', it: 'Data emissione' },
  revision: { en: 'Rev.', it: 'Rev.' },
  sheet: { en: 'Sheet', it: 'Foglio' },
  nextSheet: { en: 'Next', it: 'Seguente' },
  totalSheets: { en: 'Total', it: 'Totale' },
  electricalDrawings: { en: 'Electrical drawings', it: 'Schemi elettrici' },
  sheetIndex: { en: 'Sheet index', it: 'Indice dei fogli' },
  title: { en: 'Title', it: 'Titolo' },
  pageType: { en: 'Type', it: 'Tipo' },
  yes: { en: 'YES', it: 'SI' },
  no: { en: 'NO', it: 'NO' },
  'bom.designation': { en: 'Designation', it: 'Designazione' },
  'bom.position': { en: 'Position', it: 'Posizione' },
  'bom.qty': { en: 'Qty', it: 'Q.tà' },
  'bom.code': { en: 'Part code', it: 'Codice' },
  'bom.description': { en: 'Description', it: 'Descrizione' },
  'bom.manufacturer': { en: 'Manufacturer', it: 'Costruttore' },
  'bom.title': { en: 'Bill of materials', it: 'Distinta materiali' },
  'type.cover': { en: 'Cover sheet', it: 'Copertina' },
  'type.contents': { en: 'Contents', it: 'Indice' },
  'type.power': { en: 'Power', it: 'Potenza' },
  'type.control': { en: 'Control', it: 'Comando' },
  'type.plc': { en: 'PLC', it: 'PLC' },
  'type.terminals': { en: 'Terminals', it: 'Morsettiere' },
  'type.cables': { en: 'Cables', it: 'Cavi' },
  'type.layout': { en: 'Cabinet layout', it: 'Layout quadro' },
  'type.singleLine': { en: 'Single-line diagram', it: 'Schema unifilare' },
  'type.data': { en: 'Project data', it: 'Dati di progetto' },
} as const satisfies Record<string, { en: string; it: string }>;
export type DrawingTextKey = keyof typeof DRAWING_TEXT;

/** A drawing text in the drawing language. */
export function dt(lang: Lang, key: DrawingTextKey): string {
  return DRAWING_TEXT[key][lang];
}

/** An LText in the drawing language, falling back to the other language, then to ''. */
export function pick(text: LText | undefined, lang: Lang): string {
  if (!text) return '';
  return text[lang] || text[lang === 'en' ? 'it' : 'en'] || '';
}
