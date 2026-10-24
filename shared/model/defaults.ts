// Defaults for new projects: drawing style, frame and title block template, project skeleton.

import { DEFAULT_POTENTIALS } from '../potentials';
import { zoneRange } from './zones';
import { DEFAULT_NUMBERING, DEFAULT_WIRE_CLASSES } from './wireDefaults';
import type { BomSettings, CrossRefSettings, DrawingStyle, Page, Project, ProjectSettings, Template, TitleCell } from './types';
import { PROJECT_FORMAT } from './types';
import type { SheetSize } from '../sheets';

export const CURRENT_VERSION = 4;

/** Designations and wire numbers in red, as on the reference style of production sets (brief, M1). */
export const DEFAULT_STYLE: DrawingStyle = {
  colours: {
    symbol: '#000000',
    wire: '#000000',
    designation: '#d40000',
    wireNumber: '#d40000',
    text: '#000000',
    annotation: '#000000',
    frame: '#000000',
    titleBlock: '#000000',
  },
  weights: { symbol: 0.35, wire: 0.35, frame: 0.7, annotation: 0.35 },
  font: 'sans',
  textSizes: { designation: 3.5, wireNumber: 2.5, text: 3.5 },
};

/**
 * Title block of the default template: 180 mm wide, 36 mm high (4 rows of 9 mm), logo on the left.
 * Width and the field set follow ISO 7200 in spirit; exact values to confirm in docs/to-verify.md.
 */
export const DEFAULT_TITLE_CELLS: TitleCell[] = [
  { key: 'logo', x: 0, y: 0, w: 40, h: 36 },
  { key: 'client', x: 40, y: 0, w: 70, h: 9 },
  { key: 'product', x: 110, y: 0, w: 70, h: 9 },
  { key: 'sheetTitle', x: 40, y: 9, w: 140, h: 9 },
  { key: 'drawingNo', x: 40, y: 18, w: 50, h: 9 },
  { key: 'orderNo', x: 90, y: 18, w: 30, h: 9 },
  { key: 'issueDate', x: 120, y: 18, w: 30, h: 9 },
  { key: 'revision', x: 150, y: 18, w: 30, h: 9 },
  { key: 'drawn', x: 40, y: 27, w: 30, h: 9 },
  { key: 'checked', x: 70, y: 27, w: 30, h: 9 },
  { key: 'approved', x: 100, y: 27, w: 30, h: 9 },
  { key: 'sheet', x: 130, y: 27, w: 17.5, h: 9 },
  { key: 'nextSheet', x: 147.5, y: 27, w: 17.5, h: 9 },
  { key: 'totalSheets', x: 165, y: 27, w: 15, h: 9 },
];

export function defaultTemplate(): Template {
  return {
    id: 'default',
    name: 'Default',
    // Margins: filing margin 20 mm left, 10 mm elsewhere. PLACEHOLDER until checked against ISO 5457
    // (docs/to-verify.md); a company template overrides them.
    frame: { margins: { l: 20, t: 10, r: 10, b: 10 }, columns: zoneRange('1', '8'), rows: zoneRange('A', 'F') },
    titleBlock: { w: 180, h: 36, cells: DEFAULT_TITLE_CELLS.map((c) => ({ ...c })) },
  };
}

export const DEFAULT_CROSSREF: CrossRefSettings = { format: 'page.column', pageDigits: 0 };
export const DEFAULT_BOM: BomSettings = {
  columns: ['designation', 'position', 'qty', 'code', 'description', 'manufacturer', 'field:make', 'field:notes'],
  units: 1,
  group: 'device',
  userFields: [
    { id: 'make', label: { en: 'Make or buy', it: 'Produzione o acquisto' } },
    { id: 'notes', label: { en: 'Notes', it: 'Note' } },
  ],
};

export function defaultSettings(): ProjectSettings {
  return {
    drawingLanguage: 'en',
    symbolStandard: 'iec',
    style: structuredClone(DEFAULT_STYLE),
    defaultSize: 'A3',
    defaultTemplateId: 'default',
    crossRef: { ...DEFAULT_CROSSREF },
    bom: structuredClone(DEFAULT_BOM),
    numbering: { ...DEFAULT_NUMBERING },
    wireColours: false,
    installationMethod: '',
  };
}

export function newProject(id: string, name: string, patch: Partial<ProjectSettings> = {}): Project {
  return {
    format: PROJECT_FORMAT,
    version: CURRENT_VERSION,
    id,
    name,
    settings: { ...defaultSettings(), ...patch },
    properties: {},
    assembly: {},
    templates: [defaultTemplate()],
    potentials: structuredClone(DEFAULT_POTENTIALS),
    pages: [],
    assets: {},
    symbols: [],
    devices: [],
    parts: [],
    projectParts: [],
    wireClasses: structuredClone(DEFAULT_WIRE_CLASSES),
    wireTypes: [],
    cables: [],
    issueStatus: 'proposal',
    revisions: [],
  };
}

export function newPage(id: string, type: Page['type'], title: Page['title'], size: SheetSize = 'A3'): Page {
  return { id, type, title, size, templateId: '', elements: [] };
}
