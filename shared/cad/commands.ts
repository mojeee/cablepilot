// The command table of the command line: names, aliases, and how typed text is routed. The words CAD
// users type (L, PL, REC, C, M, CO, RO, MI, E, TR, EX, O, Z, ZE, U, PAN, LA, DI...) plus ours (INSERT,
// WIRE, NUMBER, REPORT, CHECK, SIZE...). What a command does is in the renderer (app/renderer/cad).

import { t } from '../i18n';

export interface CadCommand {
  /** The full command name, upper case. */
  name: string;
  aliases: string[];
  /** Whether the command accepts arguments on the same line (INSERT coil, ZOOM E). Others never do. */
  args?: boolean;
  label: () => string;
}

const c = (name: string, aliases: string[], label: () => string, args = false): CadCommand => ({ name, aliases, label, args });

export const CAD_COMMANDS: CadCommand[] = [
  c('LINE', ['L'], () => t('Draw lines')),
  c('PLINE', ['PL'], () => t('Draw a polyline')),
  c('RECTANGLE', ['REC', 'RECTANG'], () => t('Draw a rectangle')),
  c('CIRCLE', ['C'], () => t('Draw a circle')),
  c('DASHED', ['DASH'], () => t('Draw a dashed outline')),
  c('TEXT', ['T', 'MTEXT'], () => t('Place text')),
  c('TABLE', ['TB'], () => t('Place a table')),
  c('IMAGE', ['IM'], () => t('Place an image')),
  c('WARNING', ['SIGN'], () => t('Place a warning sign')),
  c('WIRE', ['W'], () => t('Draw wires')),
  c('MOVE', ['M'], () => t('Move objects')),
  c('COPY', ['CO', 'CP'], () => t('Copy objects')),
  c('ROTATE', ['RO'], () => t('Rotate objects')),
  c('MIRROR', ['MI'], () => t('Mirror objects')),
  c('ERASE', ['E', 'DEL'], () => t('Erase objects')),
  c('TRIM', ['TR'], () => t('Trim lines at other lines')),
  c('EXTEND', ['EX'], () => t('Extend lines to other lines')),
  c('OFFSET', ['O'], () => t('Offset lines and outlines')),
  c('ZOOM', ['Z'], () => t('Zoom'), true),
  c('EXTENTS', ['ZE'], () => t('Zoom to the whole page')),
  c('PAN', ['P'], () => t('Pan the view')),
  c('UNDO', ['U'], () => t('Undo')),
  c('REDO', [], () => t('Redo')),
  c('SELECTALL', ['ALL'], () => t('Select everything on the page')),
  c('DIST', ['DI'], () => t('Measure a distance')),
  c('LAYER', ['LA'], () => t('Layers')),
  c('INSERT', ['I', 'SYMBOL'], () => t('Insert a symbol or device'), true),
  c('BOX', ['BLACKBOX'], () => t('Insert a black box')),
  c('CONNECTOR', ['CONN'], () => t('Insert a connector')),
  c('NUMBER', ['NW', 'NUMBERWIRES'], () => t('Number the wires')),
  c('RENUMBER', ['RD'], () => t('Renumber designations')),
  c('WIRES', ['WL'], () => t('Wires and cables')),
  c('REPORT', ['REP', 'REPORTS'], () => t('Reports')),
  c('BOM', [], () => t('Bill of materials')),
  c('CHECK', ['CHK'], () => t('Electrical rule check')),
  c('SIZE', ['SIZING'], () => t('Size cables and components')),
  c('PLC', [], () => t('PLC I/O overview and tag lists')),
  c('WAREHOUSE', ['WH'], () => t('Warehouse stock list')),
  c('AISETTINGS', ['AIKEY'], () => t('AI assistant settings: provider, model, API key')),
  c('REVISIONS', ['REV'], () => t('Revisions and issue status')),
  c('SETTINGS', ['PS'], () => t('Project settings')),
  c('ADDPAGE', ['PAGE'], () => t('Add a page')),
  c('ENCLOSURE', ['ENC'], () => t('Place an enclosure'), true),
  c('PLATE', ['MP'], () => t('Place or draw a mounting plate'), true),
  c('RAIL', ['DR'], () => t('Draw a DIN rail')),
  c('DUCT', ['DU'], () => t('Draw a wire duct')),
  c('ZONE', ['NZ'], () => t('Draw a no-mount zone')),
  c('COVER', ['CV'], () => t('Draw a cover')),
  c('DIM', ['DIMLINEAR'], () => t('Draw a dimension line')),
  c('PLACE', ['PD'], () => t('Place devices from the schematic'), true),
  c('ALIGN', ['AL'], () => t('Align layout items'), true),
  c('DISTRIBUTE', ['DS'], () => t('Distribute layout items evenly'), true),
  c('LAYOUT', ['LAY'], () => t('Cabinet layout window')),
  c('SUGGEST', ['SL'], () => t('Suggest a cabinet layout')),
  c('VIEW3D', ['3D'], () => t('3D view of the cabinet')),
  c('DRILL', ['DRILLDXF'], () => t('Export the mounting plate for drilling')),
  c('NEW', [], () => t('New project')),
  c('OPEN', [], () => t('Open a project')),
  c('SAVE', ['QSAVE'], () => t('Save')),
  c('SAVEAS', [], () => t('Save as')),
  c('PDF', ['PLOT'], () => t('Export PDF')),
  c('DXFOUT', ['DXF'], () => t('Export the page as DXF')),
  c('DXFIN', [], () => t('Import a DXF file')),
  c('GRID', [], () => t('Grid display'), true),
  c('ORTHO', [], () => t('Ortho mode'), true),
  c('SNAP', [], () => t('Grid snap'), true),
  c('OSNAP', ['OS'], () => t('Object snap'), true),
  c('POLAR', [], () => t('Polar tracking'), true),
  c('DYN', [], () => t('Dynamic input'), true),
  c('PAGES', [], () => t('Pages panel')),
  c('SYMBOLS', [], () => t('Symbols and devices panel')),
  c('PROPERTIES', ['PR', 'PROPS'], () => t('Properties panel')),
  c('MESSAGES', [], () => t('Messages panel')),
  c('CHAT', ['AI'], () => t('AI chat panel')),
  c('CLEANSCREEN', ['FULLSCREEN'], () => t('Full-screen canvas')),
  c('RESETLAYOUT', [], () => t('Reset the panel layout')),
  c('PREVIEW', [], () => t('Print preview')),
  c('HELP', ['?'], () => t('Keyboard shortcuts')),
];

const BY_WORD = new Map<string, CadCommand>();
for (const cmd of CAD_COMMANDS) {
  BY_WORD.set(cmd.name, cmd);
  for (const a of cmd.aliases) BY_WORD.set(a, cmd);
}

/** The command a word names (full name or alias, any case), if any. */
export const resolveCommand = (word: string): CadCommand | undefined => BY_WORD.get(word.trim().toUpperCase());

export type Routed =
  | { kind: 'empty' }
  | { kind: 'command'; command: CadCommand; args: string }
  /** One unknown word: most likely a typing mistake. */
  | { kind: 'unknown'; word: string }
  /** Anything else is a request to the assistant. */
  | { kind: 'natural'; text: string };

/** Decides what typed text is: a command (with arguments when the command takes them), an unknown word, or a request for the assistant. */
export function routeInput(text: string): Routed {
  const s = text.trim();
  if (!s) return { kind: 'empty' };
  const [first, ...rest] = s.split(/\s+/);
  const command = resolveCommand(first);
  const args = rest.join(' ');
  if (command && (args === '' || command.args)) return { kind: 'command', command, args };
  if (rest.length === 0) return { kind: 'unknown', word: first };
  return { kind: 'natural', text: s };
}

/** Command names and aliases that start with the typed prefix, best first (exact, then aliases, then names). */
export function autocomplete(prefix: string, limit = 8): { word: string; command: CadCommand }[] {
  const p = prefix.trim().toUpperCase();
  if (!p || /\s/.test(p)) return [];
  const out: { word: string; command: CadCommand }[] = [];
  for (const [word, command] of BY_WORD) if (word.startsWith(p)) out.push({ word, command });
  return out.sort((a, b) => (a.word === p ? -1 : b.word === p ? 1 : a.word.length - b.word.length || a.word.localeCompare(b.word))).slice(0, limit);
}
