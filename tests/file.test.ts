import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS, migrate, parseProject, projectFileName, serializeProject, validateProject } from '@shared/file';
import { CURRENT_VERSION } from '@shared/model/defaults';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
function sample() {
  const b = builder(lib, 'proj1', 'Conveyor 1');
  b.set({ properties: { client: 'ACME', orderNo: '42' }, assembly: { ipDegree: 'IP54' } });
  const pg = b.addPage('power', { en: 'Power', it: 'Potenza' });
  const k = b.place(pg, 'coil', 50, 50, { functionText: { en: 'Main contactor' } });
  b.wire(pg, [{ x: k.pin('A1').x, y: 20 }, k.pin('A1')], { potential: 'L1', conductors: 3 });
  b.text(pg, 10, 10, 'Two\nlines', { rot: 90 });
  b.rect(pg, 5, 5, 30, 20, { dashed: true, label: 'Module' });
  b.warning(pg, 100, 100, 'electric');
  b.addPage('data', { en: 'Data' });
  return b.project;
}

describe('project file', () => {
  it('round-trips exactly', () => {
    const p = sample();
    const r = parseProject(serializeProject(p));
    expect(r.ok && r.value).toEqual(p);
  });
  it('writes the same text for the same project, whatever the key order in memory', () => {
    const p = sample();
    const shuffled = JSON.parse(JSON.stringify(p), (_k, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)) as typeof p;
    expect(serializeProject(shuffled)).toBe(serializeProject(p));
    const text = serializeProject(p);
    expect(text.indexOf('"format"')).toBeLessThan(text.indexOf('"pages"'));
    expect(text.endsWith('}\n')).toBe(true);
  });
  it('diffs well: a change on one page changes only that page\'s lines', () => {
    const p = sample();
    const q = { ...p, pages: p.pages.map((pg, i) => (i === 1 ? { ...pg, title: { en: 'Changed' } } : pg)) };
    const a = serializeProject(p).split('\n'), b = serializeProject(q).split('\n');
    expect(a.length).toBe(b.length);
    expect(a.filter((l, i) => l !== b[i])).toHaveLength(1);
  });
  it('validates against the JSON Schema', () => {
    const schema = JSON.parse(readFileSync(join(__dirname, '..', 'shared/schema/project.schema.json'), 'utf8')) as object;
    const validate = new Ajv2020({ strict: false }).compile(schema);
    expect(validate(JSON.parse(serializeProject(sample()))), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ format: 'cablepilot-project' })).toBe(false);
  });
  it('reports damaged files in plain language', () => {
    expect(parseProject('{nope')).toMatchObject({ ok: false, error: { code: 'file.json' } });
    expect(parseProject('[]')).toMatchObject({ ok: false, error: { code: 'file.invalid' } });
    expect(parseProject('{"format":"other"}')).toMatchObject({ ok: false, error: { code: 'file.invalid' } });
    const p = JSON.parse(serializeProject(sample())) as { pages: { elements: { kind: string }[] }[] };
    p.pages[0].elements[0].kind = 'banana';
    const r = parseProject(JSON.stringify(p));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('banana');
    expect(validateProject(JSON.parse(serializeProject(sample())))).toEqual([]);
  });
  it('refuses a file from a newer version', () => {
    const p = { ...JSON.parse(serializeProject(sample())), version: CURRENT_VERSION + 1 };
    expect(parseProject(JSON.stringify(p))).toMatchObject({ ok: false, error: { code: 'file.too-new' } });
  });
  it('runs migrations in order up to the target version', () => {
    const calls: number[] = [];
    const migrations = {
      1: (d: Record<string, unknown>) => { calls.push(1); return { ...d, renamed: d.old }; },
      2: (d: Record<string, unknown>) => { calls.push(2); return { ...d, flag: true }; },
    };
    const r = migrate({ version: 1, old: 'x' }, migrations, 3);
    expect(calls).toEqual([1, 2]);
    expect(r.ok && r.value).toEqual({ version: 3, old: 'x', renamed: 'x', flag: true });
    expect(migrate({ version: 1 }, {}, 2)).toMatchObject({ ok: false, error: { code: 'file.no-migration' } });
    expect(migrate({}, MIGRATIONS)).toMatchObject({ ok: false, error: { code: 'file.version' } });
  });
  it('makes safe file names', () => {
    expect(projectFileName(sample())).toBe('Conveyor-1.cablepilot.json');
  });
  it('migrates a version 1 file (M1) to devices, parts and cross-reference settings', () => {
    const v2 = JSON.parse(serializeProject(sample())) as Record<string, unknown>;
    const { devices, parts, projectParts, ...v1 } = v2;
    void devices; void parts; void projectParts;
    const old = { ...v1, version: 1, settings: { ...(v1.settings as object), crossRef: undefined, bom: undefined } };
    expect(parseProject(JSON.stringify(old)).ok).toBe(true);
    const r = parseProject(JSON.stringify(old));
    if (r.ok) {
      expect(r.value.version).toBe(2);
      expect(r.value.devices).toEqual([]);
      expect(r.value.settings.crossRef).toEqual({ format: 'page.column', pageDigits: 0 });
      expect(r.value.settings.bom.units).toBe(1);
    }
  });
});
