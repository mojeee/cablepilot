// IEC 81346 reference designations: =function +location -product. Numbering is automatic: the next
// free number of a letter code within the same function and location aspects. The product part is
// stored on the element ("-K1"); function and location default from the page.

import type { Library } from './library/types';
import { symbolRole, withProjectSymbols } from './library/types';
import type { BoxEl, Page, Project, SymbolEl } from './model/types';

/**
 * Letter codes of the product aspect (IEC 81346-2, class letters). Recorded from secondary
 * sources: listed in docs/to-verify.md.
 */
export const DESIGNATION_LETTERS: Record<string, { en: string; it: string }> = {
  A: { en: 'Assemblies and sub-assemblies', it: 'Assiemi e sottoassiemi' },
  B: { en: 'Transducers and sensors', it: 'Trasduttori e sensori' },
  C: { en: 'Capacitors', it: 'Condensatori' },
  F: { en: 'Protective devices (fuses, overload relays)', it: 'Dispositivi di protezione (fusibili, relè termici)' },
  G: { en: 'Power sources (batteries, supplies)', it: 'Sorgenti di energia (batterie, alimentatori)' },
  H: { en: 'Signalling devices', it: 'Dispositivi di segnalazione' },
  K: { en: 'Relays and contactors', it: 'Relè e contattori' },
  M: { en: 'Motors', it: 'Motori' },
  Q: { en: 'Switching of power (breakers, switches)', it: 'Apparecchi di manovra di potenza (interruttori, sezionatori)' },
  R: { en: 'Resistors', it: 'Resistenze' },
  S: { en: 'Input devices (pushbuttons, switches)', it: 'Dispositivi di comando (pulsanti, selettori)' },
  T: { en: 'Transformers and converters', it: 'Trasformatori e convertitori' },
  V: { en: 'Semiconductors', it: 'Semiconduttori' },
  X: { en: 'Terminals and connectors', it: 'Morsetti e connettori' },
  Z: { en: 'Filters and limiters', it: 'Filtri e limitatori' },
};

export interface ParsedDesignation {
  function?: string;
  location?: string;
  letters?: string;
  number?: number;
  suffix?: string;
}

/** Parses "=A1+DS-K1", "+DS-K1", "-K1", "-KM12A". Unparseable parts are left out. */
export function parseDesignation(s: string): ParsedDesignation {
  const out: ParsedDesignation = {};
  const f = /=([A-Za-z0-9]+)/.exec(s);
  if (f) out.function = f[1];
  const l = /\+([A-Za-z0-9]+)/.exec(s);
  if (l) out.location = l[1];
  const p = /-([A-Z]+)(\d+)([A-Za-z]*)/.exec(s);
  if (p) {
    out.letters = p[1];
    out.number = Number(p[2]);
    if (p[3]) out.suffix = p[3];
  }
  return out;
}

export function formatDesignation(d: { function?: string; location?: string; letters: string; number: number; suffix?: string }): string {
  return `${d.function ? `=${d.function}` : ''}${d.location ? `+${d.location}` : ''}-${d.letters}${d.number}${d.suffix ?? ''}`;
}

/** A symbol or box: the elements that carry a designation. */
type Designated = SymbolEl | BoxEl;

/** The aspects of an element on a page: element location wins over the page's. */
export function aspectsOf(page: Page, el: { location?: string }): { function: string; location: string } {
  return { function: page.function ?? '', location: el.location ?? page.location ?? '' };
}

/** The full designation (aspects and product) that identifies a device (shared/devices.ts). */
export function fullDesignation(fn: string, loc: string, designation: string): string {
  const d = parseDesignation(designation);
  if (d.letters && d.number !== undefined) return formatDesignation({ function: fn, location: loc, letters: d.letters, number: d.number, suffix: d.suffix });
  return `${fn ? `=${fn}` : ''}${loc ? `+${loc}` : ''}${designation}`;
}

const aspectKey = (fn: string, loc: string, letters: string) => `${fn}|${loc}|${letters}`;
const BOX_LETTER: Record<BoxEl['variant'], string> = { blackbox: 'A', connector: 'X' };

/** Every designation in the project: symbols, boxes and assembly outlines, with the aspects of their page. */
function* designations(project: Project): Generator<{ page: Page; el: Designated | { kind: 'rect'; assembly: string; location?: undefined }; designation: string }> {
  for (const pg of project.pages) {
    for (const el of pg.elements) {
      if ((el.kind === 'symbol' || el.kind === 'box') && el.designation) yield { page: pg, el, designation: el.designation };
      else if (el.kind === 'rect' && el.assembly) yield { page: pg, el: { kind: 'rect', assembly: el.assembly }, designation: el.assembly };
    }
  }
}

export function usedNumbers(project: Project, fn: string, loc: string, letters: string, skip?: (el: unknown) => boolean): Set<number> {
  const used = new Set<number>();
  for (const { page, el, designation } of designations(project)) {
    if (skip?.(el)) continue;
    const d = parseDesignation(designation);
    const a = aspectsOf(page, el);
    if (d.letters === letters && d.number !== undefined && a.function === fn && a.location === loc) used.add(d.number);
  }
  return used;
}

/** The next free designation for a letter code on a page, e.g. "-K3". */
export function nextDesignation(project: Project, page: Page, letters: string, location?: string): string {
  const fn = page.function ?? '';
  const loc = location ?? page.location ?? '';
  const used = usedNumbers(project, fn, loc, letters);
  let n = 1;
  while (used.has(n)) n++;
  return `-${letters}${n}`;
}

/** Symbols that take an automatic designation: their definition has a letter and autoNumber is not false. */
export function autoLetters(lib: Library, el: SymbolEl): string | null {
  const def = lib.symbols.get(el.symbolId);
  return def && def.designationLetter && def.autoNumber !== false ? def.designationLetter : null;
}
const autoLettersOf = (lib: Library, el: Designated): string | null => (el.kind === 'box' ? BOX_LETTER[el.variant] : autoLetters(lib, el));

/**
 * Renumbers the automatically numbered devices of the project (or of one page): per function,
 * location and letter code, 1, 2, 3... in reading order (page order, then left to right, top to
 * bottom). All representations of a device (its coil and contacts, its single-line and multi-line
 * symbols) share one designation, so they are renumbered together and stay linked; device data
 * (parts, parent assembly), assembly outlines and mating connectors follow. A page renumber keeps
 * devices that also appear on other pages and the numbers other pages already use.
 */
export function renumber(project: Project, libIn: Library, pageId?: string): Project {
  const lib = withProjectSymbols(libIn, project.symbols);
  type Member = { page: Page; el: Designated };
  const groups = new Map<string, { members: Member[]; auto: Member | null; fn: string; loc: string; first: Member }>();
  project.pages.forEach((pg) => {
    const els = pg.elements.filter((e): e is Designated => e.kind === 'symbol' || e.kind === 'box').sort((a, b) => a.x - b.x || a.y - b.y);
    for (const el of els) {
      const a = aspectsOf(pg, el);
      const gk = el.designation ? fullDesignation(a.function, a.location, el.designation) : `#${pg.id}/${el.id}`;
      let g = groups.get(gk);
      if (!g) groups.set(gk, (g = { members: [], auto: null, fn: a.function, loc: a.location, first: { page: pg, el } }));
      g.members.push({ page: pg, el });
      if (!g.auto && autoLettersOf(lib, el)) g.auto = { page: pg, el };
    }
  });
  const counters = new Map<string, number>();
  const taken = new Map<string, Set<number>>();
  // Numbers held by things that are not renumbered (assembly outlines, devices outside a page renumber).
  const fixed = (fn: string, loc: string, letters: string): Set<number> => {
    const k = aspectKey(fn, loc, letters);
    let set = taken.get(k);
    if (!set) {
      set = new Set<number>();
      const renumbered = new Set<unknown>();
      for (const g of groups.values()) if (g.auto && (!pageId || g.members.every((m) => m.page.id === pageId))) for (const m of g.members) renumbered.add(m.el);
      for (const n of usedNumbers(project, fn, loc, letters, (el) => renumbered.has(el))) set.add(n);
      taken.set(k, set);
    }
    return set;
  };
  const keyMap = new Map<string, string>();
  const productMap = new Map<string, string>();
  const newDes = new Map<Designated, string>();
  for (const [gk, g] of groups) {
    if (!g.auto) continue;
    if (pageId && !g.members.every((m) => m.page.id === pageId)) continue;
    const letters = parseDesignation(g.auto.el.designation).letters ?? (autoLettersOf(lib, g.auto.el) as string);
    const used = fixed(g.fn, g.loc, letters);
    const ck = aspectKey(g.fn, g.loc, letters);
    let n = counters.get(ck) ?? 0;
    do n++; while (used.has(n));
    counters.set(ck, n);
    const des = `-${letters}${n}`;
    for (const m of g.members) newDes.set(m.el, des);
    if (!gk.startsWith('#')) {
      keyMap.set(gk, fullDesignation(g.fn, g.loc, des));
      productMap.set(g.members[0].el.designation, des);
    }
  }
  const remap = (k: string | undefined) => (k === undefined ? k : (keyMap.get(k) ?? k));
  const pages = project.pages.map((pg) => {
    let changed = false;
    const elements = pg.elements.map((e) => {
      if (e.kind === 'symbol' || e.kind === 'box') {
        const d = newDes.get(e);
        const mate = e.kind === 'box' && e.mate ? (productMap.get(e.mate) ?? e.mate) : undefined;
        if ((d === undefined || e.designation === d) && (mate === undefined || mate === (e as BoxEl).mate)) return e;
        changed = true;
        return { ...e, designation: d ?? e.designation, ...(mate !== undefined ? { mate } : {}) };
      }
      if (e.kind === 'rect' && e.assembly) {
        const a = aspectsOf(pg, {});
        const nk = keyMap.get(fullDesignation(a.function, a.location, e.assembly));
        if (!nk) return e;
        const d = productMap.get(e.assembly);
        if (!d || d === e.assembly) return e;
        changed = true;
        return { ...e, assembly: d };
      }
      return e;
    });
    return changed ? { ...pg, elements } : pg;
  });
  const devices = keyMap.size ? project.devices.map((r) => {
    const designation = remap(r.designation) as string, parent = remap(r.parent);
    return designation === r.designation && parent === r.parent ? r : { ...r, designation, ...(parent !== undefined ? { parent } : {}) };
  }) : project.devices;
  const same = pages.every((p, i) => p === project.pages[i]) && devices === project.devices;
  return same ? project : { ...project, pages, devices };
}

/**
 * Designations that clash (rule 5): two coils, or two power parts, or two boxes with the same full
 * designation on pages of the same kind. Contacts, and a device drawn once on a single-line page
 * and once on a multi-line page, are representations of one device, not duplicates.
 */
export function duplicateDesignations(project: Project, libIn?: Library): string[] {
  const lib = libIn ? withProjectSymbols(libIn, project.symbols) : undefined;
  const seen = new Map<string, number>();
  for (const pg of project.pages) {
    for (const el of pg.elements) {
      if ((el.kind !== 'symbol' && el.kind !== 'box') || !el.designation) continue;
      const d = parseDesignation(el.designation);
      if (!d.letters) continue;
      const role = el.kind === 'box' ? 'main' : symbolRole(lib?.symbols.get(el.symbolId));
      if (role === 'aux' && lib) continue;
      const a = aspectsOf(pg, el);
      const full = formatDesignation({ function: a.function, location: a.location, letters: d.letters, number: d.number ?? 0, suffix: d.suffix });
      const k = `${full}\u0000${role}\u0000${pg.type === 'singleLine' ? 'sl' : 'ml'}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  return [...new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k.split('\u0000')[0]))].sort();
}
