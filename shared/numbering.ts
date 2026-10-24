// IEC 81346 reference designations: =function +location -product. Numbering is automatic: the next
// free number of a letter code within the same function and location aspects. The product part is
// stored on the element ("-K1"); function and location default from the page.

import type { Library } from './library/types';
import { withProjectSymbols } from './library/types';
import type { Page, Project, SymbolEl } from './model/types';

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

/** The aspects of a symbol on a page: element location wins over the page's. */
export function aspectsOf(page: Page, el: SymbolEl): { function: string; location: string } {
  return { function: page.function ?? '', location: el.location ?? page.location ?? '' };
}

const aspectKey = (fn: string, loc: string, letters: string) => `${fn}|${loc}|${letters}`;

function usedNumbers(project: Project, fn: string, loc: string, letters: string, skip?: (el: SymbolEl) => boolean): Set<number> {
  const used = new Set<number>();
  for (const pg of project.pages) {
    for (const el of pg.elements) {
      if (el.kind !== 'symbol' || !el.designation || skip?.(el)) continue;
      const d = parseDesignation(el.designation);
      const a = aspectsOf(pg, el);
      if (d.letters === letters && d.number !== undefined && a.function === fn && a.location === loc) used.add(d.number);
    }
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

/**
 * Renumbers the automatically numbered symbols of the project (or of one page): per function,
 * location and letter code, 1, 2, 3... in reading order (page order, then left to right, top to
 * bottom). A page renumber keeps the numbers other pages already use. Returns the new project.
 */
export function renumber(project: Project, libIn: Library, pageId?: string): Project {
  const lib = withProjectSymbols(libIn, project.symbols);
  const counters = new Map<string, number>();
  const taken = new Map<string, Set<number>>();
  const pages = project.pages.map((pg) => {
    if (pageId && pg.id !== pageId) return pg;
    const els = pg.elements
      .filter((e): e is SymbolEl => e.kind === 'symbol' && autoLetters(lib, e) !== null)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    const newDes = new Map<string, string>();
    for (const el of els) {
      const a = aspectsOf(pg, el);
      const letters = parseDesignation(el.designation).letters ?? (autoLetters(lib, el) as string);
      const key = aspectKey(a.function, a.location, letters);
      if (!taken.has(key)) taken.set(key, pageId ? usedNumbers(project, a.function, a.location, letters, (o) => pg.elements.includes(o)) : new Set());
      let n = counters.get(key) ?? 0;
      do n++; while (taken.get(key)?.has(n));
      counters.set(key, n);
      newDes.set(el.id, `-${letters}${n}`);
    }
    let changed = false;
    const elements = pg.elements.map((e) => {
      const d = e.kind === 'symbol' ? newDes.get(e.id) : undefined;
      if (d === undefined || (e as SymbolEl).designation === d) return e;
      changed = true;
      return { ...(e as SymbolEl), designation: d };
    });
    return changed ? { ...pg, elements } : pg;
  });
  return { ...project, pages };
}

/** Every full designation used more than once (aspects included): they must be unique (rule 5). */
export function duplicateDesignations(project: Project): string[] {
  const seen = new Map<string, number>();
  for (const pg of project.pages) {
    for (const el of pg.elements) {
      if (el.kind !== 'symbol' || !el.designation) continue;
      const d = parseDesignation(el.designation);
      if (!d.letters) continue;
      const a = aspectsOf(pg, el);
      const full = formatDesignation({ function: a.function, location: a.location, letters: d.letters, number: d.number ?? 0, suffix: d.suffix });
      seen.set(full, (seen.get(full) ?? 0) + 1);
    }
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k).sort();
}
