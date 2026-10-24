import { describe, expect, it } from 'vitest';
import { apply } from '@shared/commands';
import { duplicateDesignations, formatDesignation, nextDesignation, parseDesignation } from '@shared/numbering';
import type { SymbolEl } from '@shared/model/types';
import { builder } from './support/builder';
import { loadLibrary } from './support/library';

const lib = loadLibrary();
const des = (p: ReturnType<typeof builder>['project']) => p.pages.flatMap((pg) => pg.elements.filter((e): e is SymbolEl => e.kind === 'symbol').map((e) => e.designation));

describe('IEC 81346 designations', () => {
  it('parses and formats full designations', () => {
    expect(parseDesignation('=A1+DS-K12')).toEqual({ function: 'A1', location: 'DS', letters: 'K', number: 12 });
    expect(parseDesignation('-QF3b')).toEqual({ letters: 'QF', number: 3, suffix: 'b' });
    expect(formatDesignation({ function: 'A1', location: 'DS', letters: 'K', number: 12 })).toBe('=A1+DS-K12');
  });
  it('numbers automatically per letter code, using the smallest free number', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('control', { en: 'C' });
    b.place(pg, 'coil', 10, 10);
    b.place(pg, 'coil', 30, 10);
    b.place(pg, 'fuse', 50, 10);
    expect(des(b.project)).toEqual(['-K1', '-K2', '-F1']);
    b.run({ type: 'el/remove', page: pg, ids: [b.project.pages[0].elements[0].id] });
    expect(nextDesignation(b.project, b.project.pages[0], 'K')).toBe('-K1');
  });
  it('numbers within the location aspect: -K1 in +DS and -K1 in +MO are different devices', () => {
    const b = builder(lib, 'p', 'T');
    const a = b.addPage('control', { en: 'A' }, { location: 'DS' });
    const c = b.addPage('control', { en: 'B' }, { location: 'MO' });
    b.place(a, 'coil', 10, 10);
    b.place(a, 'coil', 30, 10);
    b.place(c, 'coil', 10, 10);
    expect(des(b.project)).toEqual(['-K1', '-K2', '-K1']);
    expect(duplicateDesignations(b.project)).toEqual([]);
  });
  it('does not number contacts automatically, and finds real duplicates', () => {
    const b = builder(lib, 'p', 'T');
    const pg = b.addPage('control', { en: 'C' });
    b.place(pg, 'contact-no', 10, 10);
    b.place(pg, 'coil', 30, 10, { designation: '-K1' });
    b.place(pg, 'coil', 50, 10, { designation: '-K1' });
    expect(des(b.project)).toEqual(['', '-K1', '-K1']);
    expect(duplicateDesignations(b.project)).toEqual(['-K1']);
  });
  it('renumbers in reading order, across pages, and is undoable as one command', () => {
    const b = builder(lib, 'p', 'T');
    const a = b.addPage('control', { en: 'A' });
    const c = b.addPage('control', { en: 'B' });
    b.place(a, 'coil', 80, 10, { designation: '-K7' });
    b.place(a, 'coil', 20, 10, { designation: '-K9' });
    b.place(c, 'coil', 20, 10, { designation: '-K3' });
    const before = b.project;
    const after = apply(before, { type: 'designation/renumber' }, { lib });
    expect(des(after)).toEqual(['-K2', '-K1', '-K3']);
    expect(des(before)).toEqual(['-K7', '-K9', '-K3']);
  });
  it('a page renumber keeps numbers used on other pages', () => {
    const b = builder(lib, 'p', 'T');
    const a = b.addPage('control', { en: 'A' });
    const c = b.addPage('control', { en: 'B' });
    b.place(a, 'coil', 20, 10, { designation: '-K1' });
    b.place(c, 'coil', 20, 10, { designation: '-K5' });
    const after = apply(b.project, { type: 'designation/renumber', page: c }, { lib });
    expect(des(after)).toEqual(['-K1', '-K2']);
  });
});
