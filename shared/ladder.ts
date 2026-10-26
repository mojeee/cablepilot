// Ladder pages (M8 part 2, the NFPA 79 option): a control page drawn as a ladder, two vertical rails with numbered
// horizontal rungs between them. The rung (line) numbers are a drawing convention common in North American practice,
// not a requirement of NFPA 79: the first number and the spacing are company choices (docs/decisions.md). On a ladder
// page a device's position is its line number, so cross-references and contact images read "105" instead of a zone,
// and the "rung" wire-numbering scheme numbers wires by the line they start on.

import type { LadderSettings, Page, Project } from './model/types';
import { templateOf } from './model/queries';
import { sheetMm } from './sheets';

const grid = (v: number): number => Math.round(v / 2.5) * 2.5;
/** Rung spacing when none is given, in millimetres: a company choice (two 5 mm grid steps). */
export const DEFAULT_RUNG_SPACING = 10;

/** Default ladder of a page: rails 15 mm inside the frame, rungs from 10 mm below its top to above the title block; numbers page × 100. */
export function defaultLadder(project: Project, page: Page): LadderSettings {
  const t = templateOf(project, page);
  const { w, h } = sheetMm(page.size);
  const m = t.frame.margins;
  const fx = m.l, fy = m.t, fw = w - m.l - m.r, fh = h - m.t - m.b;
  const index = Math.max(0, project.pages.findIndex((p) => p.id === page.id));
  return { first: (index + 1) * 100, spacing: DEFAULT_RUNG_SPACING, left: grid(fx + 15), right: grid(fx + fw - 15), top: grid(fy + 10), bottom: grid(fy + fh - t.titleBlock.h - 5) };
}

export function rungCount(l: LadderSettings): number {
  return l.spacing > 0 && l.bottom >= l.top ? Math.floor((l.bottom - l.top) / l.spacing + 1e-6) + 1 : 0;
}

/** The y of every rung with its line number. */
export function rungs(l: LadderSettings): { n: number; y: number }[] {
  return Array.from({ length: rungCount(l) }, (_, i) => ({ n: l.first + i, y: l.top + i * l.spacing }));
}

/** The line number of the rung nearest to y (clamped to the first and last rung); undefined on a page without a ladder. */
export function rungAt(page: Page, y: number): number | undefined {
  const l = page.ladder;
  if (!l) return undefined;
  const n = rungCount(l);
  if (!n) return undefined;
  const i = Math.min(n - 1, Math.max(0, Math.round((y - l.top) / l.spacing)));
  return l.first + i;
}

/** Checks a ladder read from a file or the UI; null when it cannot be drawn. */
export function validLadder(l: unknown): LadderSettings | null {
  if (typeof l !== 'object' || l === null) return null;
  const o = l as Record<string, unknown>;
  const num = (k: string) => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : NaN);
  const r = { first: Math.round(num('first')), spacing: num('spacing'), left: num('left'), right: num('right'), top: num('top'), bottom: num('bottom') };
  return r.first >= 0 && r.spacing > 0 && r.right > r.left && r.bottom >= r.top ? r : null;
}
