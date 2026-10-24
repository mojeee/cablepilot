// Drawing sheet sizes and page types.

export type SheetSize = 'A4' | 'A3' | 'A2' | 'A1' | 'A0';

/**
 * Trimmed sheet sizes in millimetres, portrait (width, height): the A series of ISO 216, which
 * ISO 5457 uses for trimmed drawing sheets (clause number to confirm: docs/to-verify.md).
 * Landscape is the usual drawing orientation: use `sheetMm`.
 */
export const SHEET_MM: Record<SheetSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  A2: { w: 420, h: 594 },
  A1: { w: 594, h: 841 },
  A0: { w: 841, h: 1189 },
};

export const SHEET_SIZES = Object.keys(SHEET_MM) as SheetSize[];

/** Sheet dimensions in millimetres; landscape by default. */
export function sheetMm(size: SheetSize, landscape = true): { w: number; h: number } {
  const { w, h } = SHEET_MM[size];
  return landscape ? { w: h, h: w } : { w, h };
}

/**
 * The page types of a project (brief, M1): the eight of the schematic set, plus single-line
 * (overview) pages and project data pages (forms).
 */
export const PAGE_TYPES = ['cover', 'contents', 'power', 'control', 'plc', 'terminals', 'cables', 'layout', 'singleLine', 'data'] as const;
export type PageType = (typeof PAGE_TYPES)[number];
