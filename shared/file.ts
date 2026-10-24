// The project file: versioned JSON with a schema (shared/schema/project.schema.json), migrations
// and stable ordering so it diffs well in Git (CLAUDE.md, rule 3). Pure: no file system here.

import { PAGE_TYPES } from './sheets';
import { SHEET_SIZES } from './sheets';
import { CURRENT_VERSION } from './model/defaults';
import { PROJECT_FORMAT, type Project } from './model/types';
import { fail, ok, type Result } from './result';

/** Key order of the written file: identity first, then the rest alphabetically; top level is fixed. */
const FIRST = ['id', 'kind', 'type', 'name'];
const TOP = ['format', 'version', 'id', 'name', 'settings', 'properties', 'assembly', 'templates', 'potentials', 'pages', 'assets', 'symbols'];

function orderedKeys(o: Record<string, unknown>, top: boolean): string[] {
  const keys = Object.keys(o).filter((k) => o[k] !== undefined);
  if (top) return TOP.filter((k) => keys.includes(k)).concat(keys.filter((k) => !TOP.includes(k)).sort());
  return FIRST.filter((k) => keys.includes(k)).concat(keys.filter((k) => !FIRST.includes(k)).sort());
}

function compact(v: unknown, top = false): string {
  if (Array.isArray(v)) return `[${v.map((x) => compact(x)).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${orderedKeys(o, top).map((k) => `${JSON.stringify(k)}:${compact(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

function emit(v: unknown, indent: string, top = false): string {
  const flat = compact(v, top);
  if (flat.length + indent.length <= 100 || v === null || typeof v !== 'object') return flat;
  const inner = `${indent}  `;
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + emit(x, inner)).join(',\n')}\n${indent}]`;
  const o = v as Record<string, unknown>;
  return `{\n${orderedKeys(o, top).map((k) => `${inner}${JSON.stringify(k)}: ${emit(o[k], inner)}`).join(',\n')}\n${indent}}`;
}

/** The text of the file: stable key order, short arrays and points on one line, trailing newline. */
export function serializeProject(p: Project): string {
  return `${emit(p, '', true)}\n`;
}

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;
/** Migrations from version n to n + 1, keyed by n. Version 1 is the first released format. */
export const MIGRATIONS: Record<number, Migration> = {};

export function migrate(data: Record<string, unknown>, migrations: Record<number, Migration> = MIGRATIONS, target = CURRENT_VERSION): Result<Record<string, unknown>> {
  let version = data.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return fail('file.version', 'The file has no valid format version.', 'It may not be a CablePilot project, or it is damaged.');
  if (version > target) return fail('file.too-new', `This project was saved by a newer CablePilot (file format ${version}, this app reads up to ${target}).`, 'Update CablePilot to open it.');
  let out = data;
  while ((version as number) < target) {
    const m = migrations[version as number];
    if (!m) return fail('file.no-migration', `There is no migration from file format ${version}.`, 'Open the file with the CablePilot version that saved it and export it again.');
    out = m(out);
    version = (version as number) + 1;
    out = { ...out, version };
  }
  return ok(out);
}

// ---- validation -----------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isPts = (v: unknown): boolean => Array.isArray(v) && v.length >= 2 && v.every((p) => isObj(p) && isNum(p.x) && isNum(p.y));
const isStrMap = (v: unknown): boolean => isObj(v) && Object.values(v).every(isStr);

const NEEDS: Record<string, (e: Record<string, unknown>) => boolean> = {
  symbol: (e) => isStr(e.symbolId) && isNum(e.x) && isNum(e.y) && [0, 90, 180, 270].includes(e.rot as number) && typeof e.mirror === 'boolean' && isStr(e.designation),
  wire: (e) => isPts(e.points),
  junction: (e) => isNum(e.x) && isNum(e.y),
  text: (e) => isNum(e.x) && isNum(e.y) && isNum(e.rot) && isStr(e.text) && isNum(e.size) && ['left', 'center', 'right'].includes(e.align as string),
  line: (e) => isPts(e.points),
  rect: (e) => isNum(e.x) && isNum(e.y) && isNum(e.w) && isNum(e.h),
  table: (e) => isNum(e.x) && isNum(e.y) && Array.isArray(e.colWidths) && e.colWidths.every(isNum) && isNum(e.rowHeight) && Array.isArray(e.cells) && e.cells.every((r) => Array.isArray(r) && r.every(isStr)) && isNum(e.size),
  image: (e) => isNum(e.x) && isNum(e.y) && isNum(e.w) && isNum(e.h) && isStr(e.assetId),
  warning: (e) => isNum(e.x) && isNum(e.y) && isNum(e.size) && ['general', 'electric', 'hot', 'autostart'].includes(e.sign as string),
  form: (e) => isNum(e.x) && isNum(e.y) && isNum(e.w) && Array.isArray(e.items),
};

/** Problems found in a project object (empty: valid). Paths point at the damaged part. */
export function validateProject(d: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(d)) return ['The file is not a project (a JSON object was expected).'];
  if (d.format !== PROJECT_FORMAT) errs.push(`format must be "${PROJECT_FORMAT}"`);
  if (!isNum(d.version)) errs.push('version must be a number');
  if (!isStr(d.id) || !d.id) errs.push('id must be a non-empty string');
  if (!isStr(d.name)) errs.push('name must be a string');
  const s = d.settings;
  if (!isObj(s)) errs.push('settings must be an object');
  else {
    if (!['en', 'it'].includes(s.drawingLanguage as string)) errs.push('settings.drawingLanguage must be "en" or "it"');
    if (!['iec', 'nfpa'].includes(s.symbolStandard as string)) errs.push('settings.symbolStandard must be "iec" or "nfpa"');
    if (!SHEET_SIZES.includes(s.defaultSize as never)) errs.push('settings.defaultSize must be A4 to A0');
    if (!isObj(s.style) || !isObj(s.style.colours) || !isObj(s.style.weights) || !isObj(s.style.textSizes)) errs.push('settings.style must have colours, weights and textSizes');
  }
  if (!isStrMap(d.properties)) errs.push('properties must be an object of strings');
  if (!isStrMap(d.assembly)) errs.push('assembly must be an object of strings');
  if (!Array.isArray(d.templates) || d.templates.length === 0) errs.push('templates must be a non-empty array');
  else {
    d.templates.forEach((t, i) => {
      if (!isObj(t) || !isStr(t.id) || !isObj(t.frame) || !isObj(t.titleBlock)) return errs.push(`templates[${i}] is damaged`);
      if (!Array.isArray(t.frame.columns) || !Array.isArray(t.frame.rows) || !isObj(t.frame.margins)) errs.push(`templates[${i}].frame needs columns, rows and margins`);
      if (!Array.isArray(t.titleBlock.cells)) errs.push(`templates[${i}].titleBlock.cells must be an array`);
    });
  }
  if (!Array.isArray(d.potentials)) errs.push('potentials must be an array');
  if (!isObj(d.assets)) errs.push('assets must be an object');
  if (!Array.isArray(d.symbols)) errs.push('symbols must be an array');
  if (!Array.isArray(d.pages)) errs.push('pages must be an array');
  else {
    const ids = new Set<string>();
    d.pages.forEach((p, i) => {
      if (!isObj(p)) return errs.push(`pages[${i}] must be an object`);
      if (!isStr(p.id) || !p.id) errs.push(`pages[${i}].id must be a non-empty string`);
      else if (ids.has(p.id)) errs.push(`pages[${i}].id "${p.id}" is used twice`);
      else ids.add(p.id);
      if (!PAGE_TYPES.includes(p.type as never)) errs.push(`pages[${i}].type "${String(p.type)}" is not a page type`);
      if (!SHEET_SIZES.includes(p.size as never)) errs.push(`pages[${i}].size must be A4 to A0`);
      if (!isObj(p.title)) errs.push(`pages[${i}].title must be an object`);
      if (!Array.isArray(p.elements)) return errs.push(`pages[${i}].elements must be an array`);
      const eids = new Set<string>();
      p.elements.forEach((e, j) => {
        const at = `pages[${i}].elements[${j}]`;
        if (!isObj(e) || !isStr(e.id) || !isStr(e.kind)) return errs.push(`${at} needs an id and a kind`);
        if (eids.has(e.id)) errs.push(`${at}.id "${e.id}" is used twice on the page`);
        eids.add(e.id);
        const check = NEEDS[e.kind];
        if (!check) errs.push(`${at}.kind "${e.kind}" is unknown`);
        else if (!check(e)) errs.push(`${at} (${e.kind}) has a missing or invalid field`);
      });
    });
  }
  return errs;
}

/** Reads project text: JSON, migration to the current version, validation. Errors are plain language. */
export function parseProject(text: string, migrations: Record<number, Migration> = MIGRATIONS): Result<Project> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('file.json', 'The file is not valid JSON.', 'It may be damaged. Try the autosaved copy, or a copy from your backups or Git history.');
  }
  if (!isObj(data)) return fail('file.invalid', 'The file is not a CablePilot project.', 'Choose a file saved by CablePilot (.cablepilot.json).');
  if (data.format !== PROJECT_FORMAT) return fail('file.invalid', 'The file is not a CablePilot project.', 'Choose a file saved by CablePilot (.cablepilot.json).');
  const m = migrate(data, migrations);
  if (!m.ok) return m;
  const errs = validateProject(m.value);
  if (errs.length) return fail('file.invalid', `The project file is damaged: ${errs.slice(0, 3).join('; ')}${errs.length > 3 ? ` (and ${errs.length - 3} more)` : ''}.`, 'Try the autosaved copy, or an earlier copy from your backups or Git history.');
  return ok(m.value as unknown as Project);
}

/** A safe file name for a project: "Conveyor 1" gives "Conveyor-1.cablepilot.json". */
export function projectFileName(p: Project): string {
  const base = p.name.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  return `${base}.cablepilot.json`;
}
