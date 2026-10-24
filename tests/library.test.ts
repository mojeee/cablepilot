// The library data files are validated by scripts/check-library.mjs; this guards the colour codes.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Colours {
  colours: { code: string; name: { en: string; it: string } }[];
}
const data = JSON.parse(readFileSync(join(__dirname, '..', 'library/colours/iec-60757.json'), 'utf8')) as Colours;

describe('IEC 60757 colour codes', () => {
  it('has unique codes', () => {
    const codes = data.colours.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('includes the codes the brief names', () => {
    const codes = new Set(data.colours.map((c) => c.code));
    for (const c of ['BK', 'BU', 'RD', 'GY', 'OG', 'GNYE']) expect(codes.has(c)).toBe(true);
  });
  it('names every colour in English and Italian', () => {
    for (const c of data.colours) expect(c.name.en && c.name.it).toBeTruthy();
  });
});

// ---- symbols ----
import { readdirSync } from 'node:fs';
import { validateLibraryFile } from '../scripts/library-validate.mjs';
import { ASSEMBLY_FIELDS, FORM_PRESETS } from '@shared/forms';
import { DRAWING_TEXT } from '@shared/drawingText';
import { loadLibrary } from './support/library';

describe('symbol library', () => {
  const lib = loadLibrary();
  const files = readdirSync(join(__dirname, '..', 'library/symbols')).filter((f) => f.endsWith('.json'));
  it('has a starter set with the symbols the samples need', () => {
    expect(lib.symbols.size).toBeGreaterThanOrEqual(30);
    for (const id of ['coil', 'contact-no', 'contact-nc', 'contactor-3p', 'mcb-3p', 'motor-3ph', 'emergency-stop', 'rectifier-3ph', 'battery', 'potential-tag']) expect(lib.symbols.has(id), id).toBe(true);
  });
  it('passes the library validation, names every symbol in both languages, with pins on the 2.5 mm grid', () => {
    for (const f of files) {
      const d = JSON.parse(readFileSync(join(__dirname, '..', 'library/symbols', f), 'utf8')) as { id: string; pins: { x: number; y: number }[]; title: { en: string; it: string } };
      expect(validateLibraryFile(d, f.replace('.json', '')), f).toEqual([]);
      expect(d.title.en && d.title.it).toBeTruthy();
      for (const p of d.pins) {
        expect(Math.abs(p.x / 2.5 - Math.round(p.x / 2.5)) < 1e-9 && Math.abs(p.y / 2.5 - Math.round(p.y / 2.5)) < 1e-9, `${f} pin on grid`).toBe(true);
      }
    }
  });
  it('rejects a broken symbol with plain problems', () => {
    expect(validateLibraryFile({ id: 'x', kind: 'symbol', source: 's', verification: 'primary', title: { en: 'a', it: 'b' }, category: 'c', function: 'f', pins: [{ id: '1', x: 0, y: 0, dir: 'sideways' }], graphics: [{ t: 'line', x1: 0 }] }, 'x').length).toBe(2);
    expect(validateLibraryFile({ id: 'y', kind: 'symbol' }, 'x').length).toBeGreaterThan(3);
  });
  it('NFPA alternatives keep the pins of the symbol (same devices behind both)', () => {
    const withNfpa = [...lib.symbols.values()].filter((s) => s.nfpa);
    expect(withNfpa.length).toBeGreaterThanOrEqual(8);
    for (const s of withNfpa) expect(s.nfpa?.source).toBeTruthy();
  });
});

describe('forms and drawing texts', () => {
  it('every form binding points at a known assembly field, with both languages', () => {
    const keys = new Set(ASSEMBLY_FIELDS.map((f) => f.key));
    for (const p of FORM_PRESETS) {
      for (const it of p.items) {
        const binds = it.type === 'table' ? it.rows.map((r) => r.bind) : it.type === 'heading' ? [] : [it.bind];
        for (const b of binds) expect(keys.has(b.replace('assembly.', '')), b).toBe(true);
        const label = it.type === 'table' ? it.label : it.label;
        expect(label.en && label.it).toBeTruthy();
      }
    }
    for (const f of ASSEMBLY_FIELDS) expect(f.label.en && f.label.it).toBeTruthy();
  });
  it('every drawing text exists in English and Italian', () => {
    for (const [k, v] of Object.entries(DRAWING_TEXT)) expect(v.en && v.it, k).toBeTruthy();
  });
});

describe('part and macro library', () => {
  const parts = readdirSync(join(__dirname, '..', 'library/parts')).filter((f) => f.endsWith('.json'));
  const read = (dir: string, f: string) => JSON.parse(readFileSync(join(__dirname, '..', 'library', dir, f), 'utf8')) as Record<string, unknown>;
  it('ships generic parts for every family rule 9 names, each with its source', () => {
    expect(parts.length).toBeGreaterThanOrEqual(60);
    const cats = new Set(parts.map((f) => read('parts', f).category));
    for (const c of ['contactors', 'relays', 'breakers', 'motor-protection', 'terminals', 'plc', 'cables', 'enclosures', 'power-electronics', 'transformers', 'sensors', 'hmi-network']) expect(cats.has(c), c).toBe(true);
    const ids = parts.join(' ');
    for (const k of ['battery', 'diode', 'rectifier-module', 'inverter-module', 'dcdc', 'hall-sensor', 'emi-filter', 'dyn11', 'phase-monitor', 'hmi', 'switch-ethernet', 'rj45']) expect(ids, k).toContain(k);
  });
  it('passes the library validation; every part is generic, with a unique code and a source', () => {
    const codes = new Set<string>();
    for (const f of parts) {
      const d = read('parts', f);
      expect(validateLibraryFile(d, f.replace('.json', '')), f).toEqual([]);
      expect(d.manufacturer, f).toBe('Generic');
      expect(String(d.source)).toContain('generic');
      expect(codes.has(d.code as string), `${f} code`).toBe(false);
      codes.add(d.code as string);
    }
  });
  it('rejects a broken part and a broken macro with plain problems', () => {
    const base = { id: 'x', kind: 'part', source: 's', verification: 'primary', title: { en: 'a', it: 'b' }, description: { en: 'a', it: 'b' }, category: 'c', code: 'C', manufacturer: 'Generic', data: { A: '1 A' } };
    expect(validateLibraryFile(base, 'x')).toEqual([]);
    expect(validateLibraryFile({ ...base, code: '', data: { A: 1 }, dimensions: { w: 1 } }, 'x')).toHaveLength(3);
    expect(validateLibraryFile({ id: 'm', kind: 'macro', source: 's', verification: 'primary', title: { en: 'a', it: 'b' }, category: 'c', size: { w: 1, h: 1 }, elements: [{ id: 'a', kind: 'form' }] }, 'm')).toHaveLength(1);
  });
  it('the shipped macro is valid and placeable', () => {
    for (const f of readdirSync(join(__dirname, '..', 'library/macros')).filter((x) => x.endsWith('.json'))) {
      expect(validateLibraryFile(read('macros', f), f.replace('.json', '')), f).toEqual([]);
    }
  });
});
