// The project model: pure data (CLAUDE.md, Architecture). Nothing here mutates; edits go through
// the commands in shared/commands. Connectivity is computed from this data (shared/connectivity).

import type { Lang } from '../i18n';
import type { PageType, SheetSize } from '../sheets';
import type { PartDef, SymbolDef } from '../library/types';

export interface Pt {
  x: number;
  y: number;
}
export type Rot = 0 | 90 | 180 | 270;
/** Text in the two supported languages; the drawing language decides which one is printed. */
export interface LText {
  en?: string;
  it?: string;
}

export type WarningSign = 'general' | 'electric' | 'hot' | 'autostart';

export interface SymbolEl {
  id: string;
  kind: 'symbol';
  symbolId: string;
  x: number;
  y: number;
  rot: Rot;
  mirror: boolean;
  /** Product part of the IEC 81346 designation, e.g. "-K1". Empty: none yet. */
  designation: string;
  /** Location aspect (+DS...) when it differs from the page's. */
  location?: string;
  functionText?: LText;
  /** Free value: the potential name of a potential tag, the signal of an interruption point, a PLC address, a rating. */
  value?: string;
  /** On a coil: a note under its contact image on the state the contacts are shown in. */
  stateNote?: LText;
}
export interface WireEl {
  id: string;
  kind: 'wire';
  /** Orthogonal polyline in page millimetres. */
  points: Pt[];
  potential?: string;
  number?: string;
  /** Conductors represented by this line on a single-line page (tick marks). */
  conductors?: number;
}
export interface JunctionEl {
  id: string;
  kind: 'junction';
  x: number;
  y: number;
}
export interface TextEl {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  rot: number;
  text: string;
  size: number;
  align: 'left' | 'center' | 'right';
  bold?: boolean;
}
export interface LineEl {
  id: string;
  kind: 'line';
  points: Pt[];
  dashed?: boolean;
}
export interface RectEl {
  id: string;
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  /** A dashed outline groups parts (a module, an assembly). */
  dashed?: boolean;
  label?: string;
  /** Designation of the assembly device this dashed outline draws (nested assemblies). */
  assembly?: string;
}
export interface TableEl {
  id: string;
  kind: 'table';
  x: number;
  y: number;
  colWidths: number[];
  rowHeight: number;
  cells: string[][];
  size: number;
  headerRow?: boolean;
}
export interface ImageEl {
  id: string;
  kind: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  assetId: string;
}
export interface WarningEl {
  id: string;
  kind: 'warning';
  x: number;
  y: number;
  size: number;
  sign: WarningSign;
}
/** A numbered, named pin of a black box or connector: a pin-level connection point on the box border. */
export interface BoxPin {
  /** The pin number as printed (also the id used by connectivity): "1", "A3". */
  id: string;
  name?: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  /** Millimetres along the side from the top-left corner. */
  offset: number;
}
/** A black box (a board, a module drawn by its pins) or a connector (header, plug, socket) with pins. */
export interface BoxEl {
  id: string;
  kind: 'box';
  variant: 'blackbox' | 'connector';
  x: number;
  y: number;
  w: number;
  h: number;
  designation: string;
  location?: string;
  functionText?: LText;
  pins: BoxPin[];
  /** Connectors: which half this is. */
  gender?: 'plug' | 'socket';
  /** Connectors: the designation of the mating connector; pins with the same number join. */
  mate?: string;
}
/** A form on a project data page; its values come from project and assembly properties. */
export type FormItem =
  | { type: 'heading'; label: LText }
  | { type: 'text'; label: LText; bind: string }
  | { type: 'tick'; label: LText; bind: string; value: string }
  | { type: 'table'; label: LText; rows: { label: LText; bind: string }[] };
export interface FormEl {
  id: string;
  kind: 'form';
  x: number;
  y: number;
  w: number;
  items: FormItem[];
}

export type El = SymbolEl | BoxEl | WireEl | JunctionEl | TextEl | LineEl | RectEl | TableEl | ImageEl | WarningEl | FormEl;
export type ElKind = El['kind'];

export interface Page {
  id: string;
  type: PageType;
  title: LText;
  size: SheetSize;
  /** Template id; empty: the project's default template. */
  templateId: string;
  /** IEC 81346 aspects the page defaults to: =function and +location. */
  function?: string;
  location?: string;
  elements: El[];
}

export type StyleColourKey = 'symbol' | 'wire' | 'designation' | 'wireNumber' | 'text' | 'annotation' | 'frame' | 'titleBlock';
export interface DrawingStyle {
  colours: Record<StyleColourKey, string>;
  /** Line weights in millimetres. */
  weights: { symbol: number; wire: number; frame: number; annotation: number };
  font: 'sans' | 'serif' | 'mono';
  /** Text heights in millimetres. */
  textSizes: { designation: number; wireNumber: number; text: number };
}

export interface Asset {
  name: string;
  mime: 'image/png' | 'image/jpeg' | 'image/svg+xml';
  /** Base64 of the file. */
  data: string;
  /** Pixel or user-unit size, for the aspect ratio. */
  w: number;
  h: number;
}

export interface TitleCell {
  /** Field key: see shared/titleblock.ts. */
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Template {
  id: string;
  name: string;
  frame: {
    margins: { l: number; t: number; r: number; b: number };
    /** Zone labels from left to right (columns) and top to bottom (rows). Their count is the zone count. */
    columns: string[];
    rows: string[];
  };
  titleBlock: { w: number; h: number; logoAssetId?: string; cells: TitleCell[] };
  /** Text in the frame margin, e.g. a copyright notice, rotated along the right margin. */
  marginText?: string;
}

export interface Potential {
  id: string;
  label: string;
  kind: 'ac' | 'neutral' | 'pe' | 'dc-plus' | 'dc-minus' | 'dc' | 'other';
}

/** A part of a device: a library part (or an embedded one) and how many per device. */
export interface PartUse {
  part: string;
  qty: number;
}
/**
 * Device data kept beside the drawing. A device is every symbol and box that carries the same full
 * designation (aspects and product): the coil and its contacts, the single-line and the multi-line
 * representation of a breaker. The record holds what is not drawn: parts, user fields, the assembly
 * it sits in. `designation` is the full designation (the device's identity).
 */
export interface DeviceRec {
  designation: string;
  parts: PartUse[];
  fields: Record<string, string>;
  /** Full designation of the assembly this device is mounted on or in (nested assemblies). */
  parent?: string;
}
/** A part with no designation (mounting plate, wiring kit): in the BOM only. */
export interface ProjectPart {
  id: string;
  part: string;
  qty: number;
  fields: Record<string, string>;
}
export type CrossRefFormat = 'page.column' | 'page-column-row';
export interface CrossRefSettings {
  format: CrossRefFormat;
  /** Page numbers padded to this many digits ("08" for 2). */
  pageDigits: number;
}
export interface BomSettings {
  /** Column ids: designation, position, qty, code, description, manufacturer, or field:<id> for a user field. */
  columns: string[];
  /** Number of units to build: quantities are multiplied by it. */
  units: number;
  /** One row per device part, or rows merged by part. */
  group: 'device' | 'part';
  userFields: { id: string; label: LText }[];
}

export interface ProjectSettings {
  /** Language of the texts printed on drawings: separate from the UI language. */
  drawingLanguage: Lang;
  /** Graphics of the symbols: IEC 60617 or the NFPA 79 / ANSI alternative. */
  symbolStandard: 'iec' | 'nfpa';
  style: DrawingStyle;
  defaultSize: SheetSize;
  defaultTemplateId: string;
  crossRef: CrossRefSettings;
  bom: BomSettings;
}

export const PROJECT_FORMAT = 'cablepilot-project';

export interface Project {
  format: typeof PROJECT_FORMAT;
  version: number;
  id: string;
  name: string;
  settings: ProjectSettings;
  /** Project data: client, product, order number, drawing number, drawn / checked / approved... */
  properties: Record<string, string>;
  /** Assembly data (IEC 61439): rated voltages, Icw, IP degree... */
  assembly: Record<string, string>;
  templates: Template[];
  potentials: Potential[];
  pages: Page[];
  assets: Record<string, Asset>;
  /** Company symbols used by this project, embedded so the project opens anywhere. */
  symbols: SymbolDef[];
  /** Device data (parts, user fields, parent assembly), see DeviceRec. */
  devices: DeviceRec[];
  /** Parts used by this project, embedded copies of library parts so the project opens anywhere. */
  parts: PartDef[];
  /** Parts with no designation. */
  projectParts: ProjectPart[];
}
