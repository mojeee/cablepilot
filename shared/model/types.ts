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
  /** The number was typed by hand: automatic numbering keeps it. */
  numberLocked?: boolean;
  /** Wire type (project.wireTypes) that overrides the wire class of the potential. */
  wireType?: string;
  /** A bundle of wires drawn as one line with one label ("10 mm² BK") instead of a number. */
  bundle?: boolean;
  /** Cable (designation, e.g. "-W1") this wire is a core of, and the core's colour code or number. */
  cable?: string;
  core?: string;
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
  /** PLC channels (cards): the I/O address as written in the project's addressing scheme, the tag (symbol name) and a comment. */
  address?: string;
  tag?: string;
  comment?: string;
}
/** What a black box is when it is a PLC rack member (M5): a CPU or an I/O card; its pins are the channels. */
export type PlcType = 'cpu' | 'di' | 'do' | 'ai' | 'ao';
export interface PlcCard {
  type: PlcType;
  /** Rack name ("0", "R1"): cards with the same rack are one rack, in slot order. */
  rack: string;
  slot: number;
}
/** How PLC addresses are written and where each area starts (byte offsets). */
export interface PlcSettings {
  /** 'siemens': I0.0, Q0.1, IW64 (word address = byte). 'iec': %IX0.0, %QX0.1, %IW32 (word address = word index). */
  style: 'siemens' | 'iec';
  start: { di: number; do: number; ai: number; ao: number };
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
  /** A PLC CPU or I/O card (channels are the pins). */
  plc?: PlcCard;
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

/** The reports a page can show (shared/reports.ts); they fill live from the schematic. */
export const REPORT_IDS = ['terminals', 'cables', 'wires', 'pins', 'bom', 'contents', 'legend', 'colours', 'suffixes', 'torque', 'nameplates', 'wireMarkers', 'terminalMarkers', 'plcIo'] as const;
export type ReportId = (typeof REPORT_IDS)[number];
/** A live report drawn on a page: rows `offset` to `offset + rows` of the report's table. */
export interface ReportEl {
  id: string;
  kind: 'report';
  x: number;
  y: number;
  report: ReportId;
  offset: number;
  /** How many rows this element shows (a page holds only so many); 0: all. */
  rows: number;
}

export type El = SymbolEl | BoxEl | WireEl | JunctionEl | TextEl | LineEl | RectEl | TableEl | ImageEl | WarningEl | FormEl | ReportEl;
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

/** How automatic wire numbers are made (shared/wires.ts). */
export interface NumberingSettings {
  /** Which counter a wire uses: one per potential, one per page and column, or a single one. */
  scheme: 'potential' | 'page-column' | 'sequential';
  /** Tokens: {n} or {n:3} counter, {page} {page:2}, {col}, {row}, {potential}, {suffix}. */
  pattern: string;
  start: number;
  step: number;
}
/** One row of the company wire-class table: what a wire of a function (a potential) looks like. */
export interface WireClass {
  /** The function: a potential id (L1, 24VDC...) or "signal" for wires with no potential. */
  id: string;
  /** Colour code (IEC 60757): BK, BU, GNYE... */
  colour: string;
  /** Cross-section in mm², as printed: "1.5". */
  crossSection: string;
  /** Wire type text: "single-core, flexible". */
  type: string;
  /** Suffix added to the wire number. */
  suffix: string;
}
/** A named single-core wire type: a wire can pick one instead of the class of its potential. */
export interface WireType {
  id: string;
  type: string;
  crossSection: string;
  colour: string;
}
export type CableKind = 'multicore' | 'ribbon' | 'patch';
/**
 * A cable. Multicore cables get their cores from the wires that name the cable; flat ribbon and
 * patch cables run between two connectors (pin n to pin n). The part gives the core count and colours.
 */
export interface CableRec {
  /** Designation, e.g. "-W1". */
  id: string;
  kind: CableKind;
  part?: string;
  /** Connector (or device) designations at the two ends: product part, e.g. "-X10". */
  from?: string;
  to?: string;
  length?: string;
  functionText?: LText;
}

/** The issue status of the whole set (the four boxes on the cover sheet). */
export const ISSUE_STATUSES = ['proposal', 'approval', 'construction', 'asBuilt'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/**
 * An issued revision (M4): the number, date and description, who drew, checked and approved it, and a
 * snapshot taken at issue time: one hash per page (to work out which pages changed since) and an
 * inventory of devices, wires and parts (to compare two revisions). Snapshots are plain data, so they
 * diff well in Git and travel with the file.
 */
export interface Revision {
  number: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  description: string;
  drawn: string;
  checked: string;
  approved: string;
  /** The issue status of the set when this revision was issued. */
  status: IssueStatus;
  pages: { id: string; title: string; hash: string }[];
  inventory: { devices: Record<string, string>; wires: Record<string, string>; parts: Record<string, number> };
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
  numbering: NumberingSettings;
  /** Draw conductors in the IEC 60757 colour of their wire class. */
  wireColours: boolean;
  /** Installation method of the conductors (IEC 60364-5-52 letter: B2, C, E...); empty: not stated, the cross-section check is skipped. */
  installationMethod: string;
  /** PLC addressing scheme (M5). */
  plc: PlcSettings;
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
  /** The company wire-class table and the named wire types. */
  wireClasses: WireClass[];
  wireTypes: WireType[];
  cables: CableRec[];
  /** Issue status of the set and the revisions issued so far, oldest first. */
  issueStatus: IssueStatus;
  revisions: Revision[];
}
