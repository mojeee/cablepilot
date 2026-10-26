// The assistant's tools (M7). Read tools answer from the project snapshot with pure code from /shared (the
// same engines the app uses: checks, sizing with stock data, the cabinet suggestion), so the model looks
// before it proposes and a rating is never invented (brief rule 12). Proposal tools never edit anything:
// they validate and append to the reply's proposal, which the user previews and accepts or rejects (rule 6).
// Tool results are JSON text for the model; `summary` lines are for the user and go through t().

import { computeBom } from '../bom';
import { apply, type Command } from '../commands';
import { runChecks } from '../checks';
import { findingDetail, findingText, RULE_SOURCE, ruleTitle } from '../checkText';
import { deviceIndex } from '../devices';
import { sizeProject, SIZING_NOTE, type Feeder } from '../feeders';
import { t, type Lang } from '../i18n';
import { findPart, withProjectSymbols, type Library, type MacroDef, type PartDef } from '../library/types';
import type { LText, Page, Project, SymbolEl, WireEl } from '../model/types';
import { DATA, sizeCable } from '../sizing';
import { stockOfPart, type StockList } from '../stock';
import { buildStarter, freeSpot } from './starter';
import { explainLayoutAnswer, moveDeviceAnswer, sizeFeederAnswer, suggestAnswer } from './fake';
import type { AiAnswer, Claim, Proposal, SourceKind } from './types';

export type JsonSchema = Record<string, unknown>;
export interface AiToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolEnv {
  project: Project;
  lib: Library;
  macros: MacroDef[];
  stock: StockList | null;
  pageId: string;
  selection: string[];
  lang: Lang;
}
/** The reply being built: the project with the proposals so far applied (later ones build on earlier ones), and the proposals. */
export interface Work {
  project: Project;
  proposals: Proposal[];
  newId: (prefix?: string) => string;
}
export interface ToolOutcome {
  content: string;
  isError: boolean;
  summary: string;
  claims?: Claim[];
}

const num = (extra: Record<string, unknown> = {}): JsonSchema => ({ type: 'number', ...extra });
const str = (description: string): JsonSchema => ({ type: 'string', description });
const page = (): JsonSchema => ({ type: 'integer', minimum: 1, description: 'Page number as in the page list (starting at 1).' });
const claimsSchema: JsonSchema = {
  type: 'array',
  description: 'Facts behind the proposal, each with its source. kind: "project" (read from this project), "standard" (ref: standard and clause, e.g. "IEC 60364-5-52 B.52-5"), "library" (ref: a part code or library id that a tool returned), "suggestion" (your own; give the assumption). Anything electrical you state yourself is a "suggestion".',
  items: { type: 'object', properties: { text: { type: 'string' }, source: { type: 'object', properties: { kind: { type: 'string', enum: ['project', 'standard', 'library', 'suggestion'] }, ref: { type: 'string' } }, required: ['kind', 'ref'] } }, required: ['text', 'source'] },
};

export const TOOL_SPECS: AiToolSpec[] = [
  { name: 'read_project', description: 'Read the project: name, pages (number, type, title), counts, supply and installation data, the current page and the selection.', parameters: { type: 'object', properties: {} } },
  { name: 'read_page', description: 'Read one page: its symbols with designations and positions, wire and text counts, and how much free room it has.', parameters: { type: 'object', properties: { page: page() }, required: ['page'] } },
  { name: 'find_devices', description: 'Find devices by designation, part code or function text (omit query to list). Returns pages, parts and load data.', parameters: { type: 'object', properties: { query: { type: 'string' }, page: page(), limit: { type: 'integer', minimum: 1, maximum: 60 } } } },
  { name: 'read_wires', description: 'Read wires (number, potential, wire type, cable), optionally of one page or one potential.', parameters: { type: 'object', properties: { page: page(), potential: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } } } },
  { name: 'run_checks', description: 'Run the electrical rule check and return the findings with their text, rule and source standard. Filter by page, rule or a text such as a designation.', parameters: { type: 'object', properties: { page: page(), query: { type: 'string', description: 'Only findings that mention this text, e.g. a designation.' } } } },
  { name: 'size_feeder', description: 'Size the feeder of a load device that has load data (breaker, contactors, overload relay, cable) with the sizing engine, the library and the stock list. Returns the requirement, its assumptions, what the project has and the part that meets it (with stock). Never invents a rating.', parameters: { type: 'object', properties: { device: { type: 'string', description: 'Designation of the load, e.g. "-M1" or "M1".' } }, required: ['device'] } },
  { name: 'size_cable', description: 'Size a cable cross-section for a design current with the sizing engine (IEC 60364-5-52 tables, ambient and grouping from the project).', parameters: { type: 'object', properties: { currentA: num({ minimum: 0.1 }), protectionA: num({ description: 'Rated or set current of the protective device, if known.' }), lengthM: num({ minimum: 0 }), method: { type: 'string', description: 'Installation method letter, default the project\'s.' } }, required: ['currentA'] } },
  { name: 'find_parts', description: 'Search library and project parts by text, category or sizing type (MCB, MPCB, Contactor, Overload relay, Power cable), with their data and stock.', parameters: { type: 'object', properties: { query: { type: 'string' }, category: { type: 'string' }, type: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 30 } } } },
  { name: 'propose_starter', description: 'Propose a motor starter from the library macro on a page: places it at the first free spot, sets the motor load data and sizes breaker, contactors, overload relay and cables with the sizing engine and the stock list. Pass cosPhi and efficiency only if the user stated them, or list them in `assumed` when you chose typical values (they will be shown as assumptions to confirm).', parameters: { type: 'object', properties: { page: page(), powerKw: num({ minimum: 0.1 }), starter: { type: 'string', enum: ['star-delta'] }, currentA: num(), cosPhi: num({ minimum: 0.1, maximum: 1 }), efficiency: num({ minimum: 10, maximum: 100, description: 'percent' }), lengthM: num(), assumed: { type: 'array', items: { type: 'string', enum: ['cosPhi', 'efficiency'] } } }, required: ['page', 'powerKw', 'starter'] } },
  { name: 'propose_renumber', description: 'Propose automatic renumbering of wires, device designations or terminals, for the whole project or pages fromPage..toPage.', parameters: { type: 'object', properties: { what: { type: 'string', enum: ['wires', 'designations', 'terminals'] }, fromPage: page(), toPage: page() }, required: ['what'] } },
  { name: 'propose_sizing', description: 'Propose the ratings the sizing engine finds for the feeder of a load device (same as size_feeder, as a proposal).', parameters: { type: 'object', properties: { device: { type: 'string' } }, required: ['device'] } },
  { name: 'propose_layout', description: 'Cabinet layout: "suggest" proposes the whole layout, "move" moves one placed device left or right (with rearrange to arrange the rest around it), "explain" lists the rules the layout uses (no change).', parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['suggest', 'move', 'explain'] }, device: { type: 'string', description: 'Designation, or "PLC" / "HMI".' }, side: { type: 'string', enum: ['left', 'right'] }, rearrange: { type: 'boolean' } }, required: ['mode'] } },
  { name: 'propose_commands', description: 'Propose editing commands (a JSON list; types: el/add, el/update, el/remove, el/move, el/rotate, el/mirror, symbol/place, wire/add, page/add, page/update, page/move, page/remove, device/update, cable/set, cable/remove, designation/renumber, wire/renumber, terminal/renumber, plc/assign, layer/set, project/set). Parts you assign must come from find_parts. Nothing changes until the user accepts.', parameters: { type: 'object', properties: { label: { type: 'string' }, summary: { type: 'array', items: { type: 'string' }, description: 'One plain line per change.' }, commands: { type: 'array', items: { type: 'object' } }, page: page(), claims: claimsSchema }, required: ['label', 'summary', 'commands'] } },
];

const MAX_COMMANDS = 150;
const ALLOWED = new Set(['el/add', 'el/update', 'el/remove', 'el/move', 'el/rotate', 'el/mirror', 'symbol/place', 'wire/add', 'page/add', 'page/update', 'page/move', 'page/remove', 'device/update', 'cable/set', 'cable/remove', 'designation/renumber', 'wire/renumber', 'terminal/renumber', 'plc/assign', 'layer/set', 'project/set', 'batch']);
const ELECTRICAL = new Set(['device/update', 'cable/set', 'project/set']);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const lt = (x: LText | undefined, lang: Lang): string => (x ? (lang === 'it' && x.it ? x.it : x.en ?? '') : '');
const j = (v: unknown): string => JSON.stringify(v);
const err = (msg: string, summary?: string): ToolOutcome => ({ content: j({ error: msg }), isError: true, summary: summary ?? t('A tool call was refused: {reason}', { reason: msg.slice(0, 140) }) });
const done = (v: unknown, summary: string, claims?: Claim[]): ToolOutcome => ({ content: j(v), isError: false, summary, ...(claims ? { claims } : {}) });

function pageOf(project: Project, v: unknown): { page: Page; no: number } | undefined {
  const i = typeof v === 'number' ? v - 1 : typeof v === 'string' ? project.pages.findIndex((p) => p.id === v) : -1;
  return project.pages[i] ? { page: project.pages[i], no: i + 1 } : undefined;
}
const pn = (project: Project, id: string | undefined): number | undefined => { const i = project.pages.findIndex((p) => p.id === id); return i >= 0 ? i + 1 : undefined; };
const projectClaim = (text: string, ref: string): Claim => ({ text, source: { kind: 'project', ref } });

/** Finds a device by designation ("-M1", "M1", "+PS-M1"). */
function findKey(project: Project, lib: Library, q: string): string | undefined {
  const want = q.trim().toUpperCase().replace(/^-/, '');
  const keys = deviceIndex(project, lib).devices.map((d) => d.key);
  return keys.find((k) => k.toUpperCase() === q.trim().toUpperCase()) ?? keys.find((k) => k.toUpperCase().endsWith(`-${want}`)) ?? keys.find((k) => k.toUpperCase().includes(want));
}

/** The text the model gets first: project, current page, selection, check results, all size-bounded. */
export function contextText(env: ToolEnv): string {
  const { project, lib } = env;
  const lang = env.lang;
  const cur = pageOf(project, env.pageId);
  const checks = runChecks(project, lib);
  const names = { pageName: (id: string) => String(pn(project, id) ?? '?') };
  const sel: string[] = [];
  for (const pg of project.pages) for (const e of pg.elements) if (env.selection.includes(e.id) && sel.length < 20) sel.push(e.kind === 'symbol' || e.kind === 'box' ? `${e.designation || e.kind}(${e.id}, page ${pn(project, pg.id)})` : `${e.kind}(${e.id})`);
  const lines = [
    `Project "${project.name}": ${project.pages.length} pages, ${project.devices.length} device records, language of the user: ${lang}.`,
    `Pages: ${project.pages.slice(0, 40).map((p, i) => `${i + 1} ${p.type} "${lt(p.title, lang)}"`).join('; ')}${project.pages.length > 40 ? `; ... ${project.pages.length - 40} more` : ''}.`,
    `Current page: ${cur ? `${cur.no} (${cur.page.type}, "${lt(cur.page.title, lang)}")` : 'none'}. Selection: ${sel.length ? sel.join(', ') : 'nothing'}.`,
    `Supply ${project.settings.supply.voltage} V, installation method ${project.settings.installationMethod || 'not stated'}. Stock list: ${env.stock ? `${env.stock.items.length} items (${env.stock.stockDate})` : 'none loaded'}.`,
    `Rule check: ${checks.errors} errors, ${checks.warnings} warnings, ${checks.infos} notes.${checks.findings.slice(0, 8).map((f) => `\n- [${f.severity}] page ${pn(project, f.page) ?? '-'}: ${findingText(f, names)}`).join('')}${checks.findings.length > 8 ? `\n- ... ${checks.findings.length - 8} more (use run_checks)` : ''}`,
  ];
  return lines.join('\n').slice(0, 6000);
}

const feederLines = (f: Feeder) => f.lines.map((l) => ({ role: l.role, subject: l.subject || undefined, status: l.status, requirement: l.requirement?.text, assumptions: l.requirement?.assumptions, current: l.current, proposedPart: l.proposal?.option ? { code: l.proposal.option.part.code, id: l.proposal.option.part.id, availability: l.proposal.option.availability, free: l.proposal.option.stock?.available } : l.proposal?.xs ? { crossSectionMm2: l.proposal.xs } : undefined, missing: l.missing.length ? l.missing : undefined, unverifiedTables: l.requirement?.unverified.length ? l.requirement.unverified : undefined }));

/** Model-supplied claims, checked: a source that cannot be verified is downgraded to a suggestion (rule 6). */
export function cleanClaims(raw: unknown, env: ToolEnv): Claim[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>();
  for (const p of [...env.lib.parts.values(), ...env.project.parts]) { known.add(p.id); known.add(p.code); }
  for (const m of env.macros) known.add(m.id);
  for (const id of env.lib.symbols.keys()) known.add(id);
  const out: Claim[] = [];
  for (const c of raw.slice(0, 10)) {
    if (!isObj(c) || typeof c.text !== 'string' || !c.text.trim() || !isObj(c.source)) continue;
    const text = c.text.trim().slice(0, 240);
    const ref = typeof c.source.ref === 'string' ? c.source.ref.trim().slice(0, 120) : '';
    let kind = c.source.kind as SourceKind;
    if (kind === 'library' && !known.has(ref)) out.push({ text, source: { kind: 'suggestion', ref: t('library entry "{ref}" not found: confirm before use', { ref }) } });
    else if (kind === 'standard' && !/^(IEC|ISO|EN|NFPA|UL|ANSI|IEEE|DIN)\b/i.test(ref)) out.push({ text, source: { kind: 'suggestion', ref: t('unverified source: confirm before use') } });
    else {
      if (kind !== 'project' && kind !== 'standard' && kind !== 'library') kind = 'suggestion';
      out.push({ text, source: { kind, ref: ref || (kind === 'suggestion' ? t('confirm before use') : '') } });
    }
  }
  return out;
}

function validateCommand(c: unknown, env: ToolEnv, work: Work, depth: number, renamed: string[]): string | null {
  if (!isObj(c) || typeof c.type !== 'string' || !ALLOWED.has(c.type)) return `unknown or not allowed command type "${isObj(c) ? String(c.type) : typeof c}"`;
  if (c.type === 'batch') {
    if (depth > 1 || !Array.isArray(c.commands)) return 'batch commands cannot be nested more than once';
    for (const x of c.commands) { const e = validateCommand(x, env, work, depth + 1, renamed); if (e) return e; }
    return null;
  }
  const lib = withProjectSymbols(env.lib, work.project.symbols);
  const needPage = (id: unknown): string | null => (typeof id === 'string' && work.project.pages.some((p) => p.id === id) ? null : `page "${String(id)}" does not exist (use the page ids from read_page)`);
  if (c.type !== 'page/add' && c.type !== 'project/set' && c.type !== 'cable/set' && c.type !== 'cable/remove' && c.type !== 'device/update' && c.type !== 'layer/set' && c.type !== 'plc/assign' && c.type !== 'terminal/renumber' && c.type !== 'wire/renumber' && c.type !== 'designation/renumber' && c.type !== 'page/move' && c.type !== 'page/remove' && c.type !== 'page/update') { const e = needPage(c.page); if (e) return e; }
  if (c.type === 'wire/renumber' || c.type === 'designation/renumber') { if (c.page !== undefined) { const e = needPage(c.page); if (e) return e; } }
  if (c.type === 'page/move' || c.type === 'page/remove' || c.type === 'page/update') { const e = needPage(c.id); if (e) return e; }
  const ensureId = (o: Record<string, unknown>, prefix: string) => { if (typeof o.id !== 'string' || !o.id) { o.id = work.newId(prefix); renamed.push(String(o.id)); } };
  if (c.type === 'symbol/place') {
    if (!isObj(c.element) || typeof c.element.symbolId !== 'string' || !lib.symbols.has(c.element.symbolId)) return `symbol "${isObj(c.element) ? String(c.element.symbolId) : '?'}" is not in the library`;
    ensureId(c.element, 's');
  }
  if (c.type === 'wire/add') ensureId(c, 'w');
  if (c.type === 'el/add') {
    if (!Array.isArray(c.elements) || !c.elements.every(isObj)) return 'el/add needs an elements list';
    for (const e of c.elements as Record<string, unknown>[]) { ensureId(e, 'e'); if (e.kind === 'symbol' && (typeof e.symbolId !== 'string' || !lib.symbols.has(e.symbolId))) return `symbol "${String(e.symbolId)}" is not in the library`; }
  }
  if (c.type === 'device/update') {
    const patch = isObj(c.patch) ? c.patch : {};
    if (typeof c.key !== 'string' || !findKey(work.project, env.lib, c.key)) return `device "${String(c.key)}" is not in the project`;
    c.key = findKey(work.project, env.lib, c.key);
    for (const u of Array.isArray(patch.parts) ? patch.parts : []) if (!isObj(u) || typeof u.part !== 'string' || !findPart(env.lib, work.project.parts, u.part)) return `part "${isObj(u) ? String(u.part) : '?'}" is not in the library or the project: I do not invent parts or ratings; use find_parts`;
  }
  if (c.type === 'cable/set') {
    const cable = isObj(c.cable) ? c.cable : null;
    if (!cable || typeof cable.id !== 'string') return 'cable/set needs a cable with an id';
    if (typeof cable.part === 'string' && cable.part && !findPart(env.lib, work.project.parts, cable.part)) return `cable part "${cable.part}" is not in the library: use find_parts`;
  }
  if (c.type === 'page/add' && (!isObj(c.page) || typeof c.page.id !== 'string' || !Array.isArray(c.page.elements))) return 'page/add needs a full page (id, type, title, size, elements)';
  return null;
}

const touchesElectrical = (cmds: unknown[]): boolean => cmds.some((c) => isObj(c) && (ELECTRICAL.has(String(c.type)) || (c.type === 'batch' && Array.isArray(c.commands) && touchesElectrical(c.commands))));

function proposeCommands(input: Record<string, unknown>, env: ToolEnv, work: Work): ToolOutcome {
  if (!Array.isArray(input.commands) || !input.commands.length) return err('commands must be a non-empty list');
  if (input.commands.length > MAX_COMMANDS) return err(`at most ${MAX_COMMANDS} commands per proposal; split it`);
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 80) : 'Assistant proposal';
  const summary = (Array.isArray(input.summary) ? input.summary : []).filter((s): s is string => typeof s === 'string').slice(0, 12).map((s) => s.slice(0, 160));
  if (!summary.length) return err('summary must list the changes, one plain line each');
  const cmds = JSON.parse(j(input.commands)) as Command[];
  const renamed: string[] = [];
  for (const c of cmds) { const e = validateCommand(c, env, work, 0, renamed); if (e) return err(e, t('A proposal did not pass validation: {reason}', { reason: e.slice(0, 140) })); }
  // A library part the project does not carry yet is embedded first, so the file stays self-contained (as the Sizing window does).
  const embedded = new Set(work.project.parts.map((p) => p.id));
  const embeds: Command[] = [];
  const need = (list: Command[]) => { for (const c of list) { if (c.type === 'batch') need(c.commands); else if (c.type === 'device/update') for (const u of c.patch.parts ?? []) { const def = env.lib.parts.get(u.part); if (def && !embedded.has(def.id)) { embedded.add(def.id); embeds.push({ type: 'part/embed', def }); } } } };
  need(cmds);
  cmds.unshift(...embeds);
  let after: Project;
  try {
    after = apply(work.project, { type: 'batch', label, commands: cmds }, { lib: env.lib });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return err(`the commands could not be applied: ${m}`, t('A proposal did not pass validation: {reason}', { reason: m.slice(0, 140) }));
  }
  if (after === work.project) return err('the commands change nothing');
  const claims = cleanClaims(input.claims, env);
  if (touchesElectrical(cmds)) claims.push({ text: t('Electrical values and data in this proposal are the assistant\'s suggestions.'), source: { kind: 'suggestion', ref: t('confirm before use') } });
  const pageId = typeof input.page === 'number' ? pageOf(work.project, input.page)?.page.id : undefined;
  work.proposals.push({ label: `AI: ${label}`, commands: [{ type: 'batch', label: `AI: ${label}`, commands: cmds }], summary, ...(pageId ? { page: pageId } : {}) });
  work.project = after;
  return done({ ok: true, generatedIds: renamed, note: 'Shown to the user as a preview; nothing changes until they accept it. Later proposals in this reply see this one as applied.' }, t('Proposed: {title}', { title: label }), claims);
}

function proposeRenumber(input: Record<string, unknown>, env: ToolEnv, work: Work): ToolOutcome {
  const what = input.what;
  if (what !== 'wires' && what !== 'designations' && what !== 'terminals') return err('what must be wires, designations or terminals');
  const n = work.project.pages.length;
  const from = asNum(input.fromPage), to = asNum(input.toPage);
  if ((from !== undefined && (from < 1 || from > n)) || (to !== undefined && (to < 1 || to > n))) return err(`pages run from 1 to ${n}`);
  const lo = from ?? (to !== undefined ? 1 : undefined), hi = to ?? (from !== undefined ? from : undefined);
  const ids = lo !== undefined && hi !== undefined ? work.project.pages.slice(Math.min(lo, hi) - 1, Math.max(lo, hi)).map((p) => p.id) : [];
  const cmds: Command[] = what === 'terminals' ? [{ type: 'terminal/renumber' }] : ids.length ? ids.map((id): Command => ({ type: what === 'wires' ? 'wire/renumber' : 'designation/renumber', page: id })) : [{ type: what === 'wires' ? 'wire/renumber' : 'designation/renumber' }];
  let after = work.project;
  for (const c of cmds) after = apply(after, c, { lib: env.lib });
  const changed: string[] = [];
  let count = 0;
  work.project.pages.forEach((pg, i) => {
    const before = new Map(pg.elements.map((e) => [e.id, e]));
    for (const e of after.pages[i].elements) {
      const o = before.get(e.id);
      if (!o || o === e) continue;
      if (e.kind === 'wire' && (o as WireEl).number !== e.number) { count++; if (changed.length < 8) changed.push(`${(o as WireEl).number ?? ''} → ${e.number ?? ''}`); }
      else if (e.kind === 'symbol' && (o as SymbolEl).designation !== e.designation) { count++; if (changed.length < 8) changed.push(`${(o as SymbolEl).designation} → ${e.designation}`); }
      else if (what === 'terminals' && JSON.stringify(o) !== JSON.stringify(e)) { count++; if (changed.length < 8) changed.push(`${e.kind} ${e.id}`); }
    }
  });
  const scope = ids.length ? t('pages {a}–{b}', { a: Math.min(lo as number, hi as number), b: Math.max(lo as number, hi as number) }) : t('the whole project');
  if (!count) return done({ ok: true, note: 'Nothing to renumber: everything already has the right number.' }, t('Renumbering: nothing to change'));
  const label = `AI: renumber ${what}`;
  const kind = what === 'wires' ? t('wires') : what === 'designations' ? t('designations') : t('terminals');
  const summary = [t('Renumber {kind} on {scope}: {n} changes', { kind, scope, n: count }), ...changed, ...(count > changed.length ? [t('... and {n} more', { n: count - changed.length })] : [])];
  work.proposals.push({ label, commands: [{ type: 'batch', label, commands: cmds }], summary, ...(ids[0] ? { page: ids[0] } : {}) });
  work.project = after;
  const claims: Claim[] = [projectClaim(what === 'wires' ? t('Numbers follow the pattern {pattern} of this project.', { pattern: work.project.settings.numbering.pattern }) : t('Numbering follows the page functions and the designation rules of this project.'), t('Project settings: numbering'))];
  return done({ ok: true, changes: count, sample: changed, note: 'Shown to the user as a preview; numbers typed by hand stay as they are.' }, t('Proposed: {title}', { title: label }), claims);
}

/** Runs one tool. Never throws: a bad call comes back as an error result the model can fix. */
export function runTool(name: string, input: Record<string, unknown>, env: ToolEnv, work: Work): ToolOutcome {
  try {
    return run(name, input, env, work);
  } catch (e) {
    return err(`the tool failed: ${e instanceof Error ? e.message : String(e)}`, t('A tool call failed.'));
  }
}

function run(name: string, input: Record<string, unknown>, env: ToolEnv, work: Work): ToolOutcome {
  const { lib, lang } = env;
  const project = work.project;
  switch (name) {
    case 'read_project': {
      const cur = pageOf(project, env.pageId);
      const idx = deviceIndex(project, lib);
      return done({ name: project.name, pages: project.pages.slice(0, 80).map((p, i) => ({ n: i + 1, id: p.id, type: p.type, title: lt(p.title, lang), elements: p.elements.length })), pageCount: project.pages.length, devices: idx.devices.length, wires: project.pages.reduce((a, p) => a + p.elements.filter((e) => e.kind === 'wire').length, 0), cables: project.cables.length, supply: project.settings.supply, installationMethod: project.settings.installationMethod || null, numbering: project.settings.numbering, currentPage: cur?.no, selection: env.selection.slice(0, 30) }, t('Read the project'), [projectClaim(t('Project "{name}" read: {n} pages.', { name: project.name, n: project.pages.length }), t('Project'))]);
    }
    case 'read_page': {
      const p = pageOf(project, input.page);
      if (!p) return err(`there is no page ${String(input.page)}; the project has ${project.pages.length} pages`);
      const syms = p.page.elements.filter((e): e is SymbolEl => e.kind === 'symbol' && !!e.designation);
      const macro = env.macros.find((m) => m.id === 'star-delta-starter');
      const spot = macro && p.page.type !== 'layout' ? freeSpot(p.page, macro.size) : undefined;
      return done({ n: p.no, id: p.page.id, type: p.page.type, title: lt(p.page.title, lang), size: p.page.size, function: p.page.function, location: p.page.location, symbols: syms.slice(0, 60).map((e) => ({ id: e.id, designation: e.designation, symbol: e.symbolId, x: e.x, y: e.y })), symbolCount: syms.length, wires: p.page.elements.filter((e) => e.kind === 'wire').length, texts: p.page.elements.filter((e) => e.kind === 'text').slice(0, 8).map((e) => (e.kind === 'text' ? e.text.slice(0, 80) : '')), freeSpotForStarter: spot ?? null }, t('Read page {n}', { n: p.no }), [projectClaim(t('Page {n}: {k} devices.', { n: p.no, k: syms.length }), t('Page {n}', { n: p.no }))]);
    }
    case 'find_devices': {
      const idx = deviceIndex(project, lib);
      const q = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
      const pg = input.page !== undefined ? pageOf(project, input.page) : undefined;
      const syms = withProjectSymbols(lib, project.symbols).symbols;
      const list = idx.devices.filter((d) => (!pg || d.reps.some((r) => r.page === pg.page.id)) && (!q || d.key.toLowerCase().includes(q) || (d.rec?.parts ?? []).some((u) => (findPart(lib, project.parts, u.part)?.code ?? u.part).toLowerCase().includes(q)) || d.reps.some((r) => (r.symbolId ? lt(syms.get(r.symbolId)?.title, 'en') : '').toLowerCase().includes(q))));
      const limit = Math.min(60, asNum(input.limit) ?? 30);
      return done({ total: list.length, devices: list.slice(0, limit).map((d) => ({ designation: d.key, symbols: [...new Set(d.reps.map((r) => r.symbolId).filter(Boolean))], pages: [...new Set(d.reps.map((r) => r.pageIndex + 1))], parts: (d.rec?.parts ?? []).map((u) => findPart(lib, project.parts, u.part)?.code ?? u.part), load: d.rec?.load })) }, t('Searched the devices ({n} found)', { n: list.length }), [projectClaim(t('{n} devices match.', { n: list.length }), t('Devices'))]);
    }
    case 'read_wires': {
      const pg = input.page !== undefined ? pageOf(project, input.page) : undefined;
      const pot = typeof input.potential === 'string' ? input.potential : undefined;
      const rows: Record<string, unknown>[] = [];
      let total = 0;
      for (const [i, p] of project.pages.entries()) {
        if (pg && p !== pg.page) continue;
        for (const e of p.elements) if (e.kind === 'wire' && (!pot || e.potential === pot)) { total++; if (rows.length < Math.min(100, asNum(input.limit) ?? 50)) rows.push({ page: i + 1, id: e.id, number: e.number, potential: e.potential, wireType: e.wireType, cable: e.cable, core: e.core }); }
      }
      return done({ total, wires: rows }, t('Read the wires ({n})', { n: total }), [projectClaim(t('{n} wires read.', { n: total }), t('Wires'))]);
    }
    case 'run_checks': {
      const res = runChecks(project, lib);
      const names = { pageName: (id: string) => String(pn(project, id) ?? '?') };
      const pg = input.page !== undefined ? pageOf(project, input.page) : undefined;
      const q = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
      const list = res.findings.filter((f) => (!pg || f.page === pg.page.id) && (!q || findingText(f, names).toLowerCase().includes(q) || Object.values(f.args).some((v) => String(v).toLowerCase().includes(q))));
      const rules = [...new Set(list.map((f) => f.rule))];
      return done({ totals: { errors: res.errors, warnings: res.warnings, notes: res.infos }, matching: list.length, findings: list.slice(0, 30).map((f) => ({ id: f.id, rule: f.rule, severity: f.severity, page: pn(project, f.page), text: findingText(f, names), detail: findingDetail(f) || undefined, source: RULE_SOURCE[f.rule], fix: f.fix ? f.fix.id : undefined })) }, t('Ran the rule check ({n} findings)', { n: list.length }), rules.slice(0, 6).map((r): Claim => ({ text: ruleTitle(r), source: { kind: RULE_SOURCE[r].startsWith('CablePilot') ? 'project' : 'standard', ref: RULE_SOURCE[r] } })));
    }
    case 'size_feeder': case 'propose_sizing': {
      const key = typeof input.device === 'string' ? findKey(project, lib, input.device) : undefined;
      if (!key) return err(`there is no device "${String(input.device)}" in the project`);
      if (name === 'propose_sizing') return answerOutcomeLib(sizeFeederAnswer(project, lib, key), work, env, t('Sized the feeder of {des}', { des: key }));
      const ctx = { project, lib, stock: env.stock, bom: computeBom(project, lib) };
      const f = sizeProject(ctx).find((x) => x.load === key);
      if (!f) return done({ device: key, note: 'This device has no load data and is not a motor: there is no feeder to size. Ask the user for its power or current.' }, t('Sized the feeder of {des}', { des: key }));
      const claims: Claim[] = [];
      if (f.ib !== undefined) claims.push(projectClaim(t('Design current Ib = {ib} A ({source}).', { ib: Math.round(f.ib * 100) / 100, source: f.ibSource === 'nameplate' ? t('nameplate') : t('computed from the load data') }), t('Load data of {des}', { des: key })));
      for (const l of f.lines) {
        for (const a of (l.requirement?.assumptions ?? []).slice(0, 2)) claims.push({ text: a, source: { kind: 'standard', ref: 'IEC 60364-5-52 / 60364-4-43 / 60947' } });
        if (l.proposal?.option) claims.push({ text: `${l.requirement?.text ?? ''} → ${l.proposal.option.part.code}`.trim(), source: { kind: 'library', ref: l.proposal.option.part.code } });
      }
      claims.push({ text: SIZING_NOTE(), source: { kind: 'suggestion', ref: t('confirm before use') } });
      return done({ device: key, ib: f.ib, ibSource: f.ibSource, lengthM: f.length, missing: f.missing.length ? f.missing : undefined, lines: feederLines(f) }, t('Sized the feeder of {des}', { des: key }), claims);
    }
    case 'size_cable': {
      const ib = asNum(input.currentA);
      if (!ib || ib <= 0) return err('currentA must be a positive number');
      const method = typeof input.method === 'string' && input.method ? input.method.toUpperCase() : project.settings.installationMethod;
      const s = sizeCable({ ib, ...(asNum(input.protectionA) ? { inRating: asNum(input.protectionA) } : {}), method, supply: project.settings.supply, ...(asNum(input.lengthM) !== undefined ? { lengthM: asNum(input.lengthM) } : {}) });
      return done({ ...s, method, assumptions: ['PVC-insulated copper, three loaded conductors', `${project.settings.supply.ambient} C ambient, grouping ${project.settings.supply.grouping}`, 'Ib <= In <= Iz and I2 <= 1.45 Iz (IEC 60364-4-43)'], note: s.problem ? `no size: ${s.problem}` : undefined }, t('Sized a cable for {ib} A', { ib }), [{ text: s.xs ? t('{xs} mm² for {ib} A, method {method}.', { xs: s.xs, ib, method: method || '?' }) : t('No cross-section found for {ib} A.', { ib }), source: { kind: 'standard', ref: 'IEC 60364-5-52 Table B.52-5, IEC 60364-4-43' } }, { text: SIZING_NOTE(), source: { kind: 'suggestion', ref: t('confirm before use') } }]);
    }
    case 'find_parts': {
      const q = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
      const cat = typeof input.category === 'string' ? input.category : '';
      const typ = typeof input.type === 'string' ? input.type : '';
      const parts: PartDef[] = [...env.lib.parts.values(), ...project.parts.filter((p) => !env.lib.parts.has(p.id))];
      const bom = computeBom(project, lib);
      const list = parts.filter((p) => (!cat || p.category === cat) && (!typ || p.data[DATA.type] === typ) && (!q || `${p.id} ${p.code} ${p.title.en} ${p.manufacturer}`.toLowerCase().includes(q)));
      const rows = list.slice(0, Math.min(30, asNum(input.limit) ?? 15)).map((p) => { const st = stockOfPart(env.stock, parts, p.id, bom); return { id: p.id, code: p.code, title: lt(p.title, lang), category: p.category, data: p.data, stockFree: st ? st.available : undefined }; });
      return done({ total: list.length, parts: rows }, t('Searched the library ({n} parts)', { n: list.length }), rows.slice(0, 3).map((r): Claim => ({ text: `${r.code}: ${r.title}`, source: { kind: 'library', ref: r.code } })));
    }
    case 'propose_starter': {
      const p = pageOf(project, input.page);
      if (!p) return err(`there is no page ${String(input.page)}; the project has ${project.pages.length} pages`);
      const kw = asNum(input.powerKw);
      if (!kw || kw <= 0 || kw > 1000) return err('powerKw must be a positive number');
      const macro = env.macros.find((m) => m.id === 'star-delta-starter');
      if (!macro || input.starter !== 'star-delta') return err('only the star-delta starter macro is in the library; a direct-on-line starter can be proposed with propose_commands');
      const assumed = (Array.isArray(input.assumed) ? input.assumed : []).filter((x): x is string => x === 'cosPhi' || x === 'efficiency').map((x) => (x === 'cosPhi' ? t('cos φ') : t('efficiency')));
      const r = buildStarter(project, lib, { macro, page: p.page, powerKw: kw, starter: 'star-delta', ...(asNum(input.currentA) ? { currentA: asNum(input.currentA) } : {}), ...(asNum(input.cosPhi) ? { cosPhi: asNum(input.cosPhi) } : {}), ...(asNum(input.efficiency) ? { efficiency: asNum(input.efficiency) } : {}), ...(asNum(input.lengthM) ? { lengthM: asNum(input.lengthM) } : {}), assumed }, env.stock, work.newId);
      if (!r.ok || !r.proposal) return err(r.error ?? 'the starter could not be built');
      work.proposals.push(r.proposal);
      work.project = apply(work.project, r.proposal.commands[0], { lib: env.lib });
      return done({ ok: true, ...r.report, note: 'Shown to the user as a preview; nothing changes until they accept it. The ratings come from the sizing engine, the library and the stock list.' }, t('Proposed: {title}', { title: r.proposal.label }), r.claims);
    }
    case 'propose_renumber': return proposeRenumber(input, env, work);
    case 'propose_layout': {
      const ids = work.newId;
      if (input.mode === 'explain') { const a = explainLayoutAnswer(project, lib, ids); return done({ ok: true, text: a.text, rules: a.claims.length }, t('Listed the layout rules'), a.claims); }
      if (input.mode === 'suggest') return answerOutcomeLib(suggestAnswer(project, lib, ids), work, env, t('Suggested a layout'));
      if (input.mode === 'move') {
        const dev = typeof input.device === 'string' ? input.device : '';
        const prompt = `move ${dev} to the ${input.side === 'left' ? 'left' : 'right'}`;
        const des = dev && !/^(plc|hmi)$/i.test(dev) ? [dev.startsWith('-') ? dev.toUpperCase() : `-${dev.toUpperCase()}`] : [];
        return answerOutcomeLib(moveDeviceAnswer(project, lib, /^(plc|hmi)$/i.test(dev) ? `${prompt} ${dev}` : prompt, des, input.rearrange === true, ids), work, env, t('Moved a device on the layout'));
      }
      return err('mode must be suggest, move or explain');
    }
    case 'propose_commands': return proposeCommands(input, env, work);
    default: return err(`unknown tool "${name}"`);
  }
}

function answerOutcomeLib(a: AiAnswer, work: Work, env: ToolEnv, summary: string): ToolOutcome {
  if (!a.proposal) return done({ ok: true, note: 'No change proposed.', text: a.text }, summary, a.claims);
  work.proposals.push(a.proposal);
  work.project = apply(work.project, a.proposal.commands[0], { lib: env.lib });
  return done({ ok: true, note: 'Shown to the user as a preview; nothing changes until they accept it.', text: a.text, summary: a.proposal.summary }, summary, a.claims);
}
