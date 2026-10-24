import { describe, expect, it } from 'vitest';
import { SHEET_MM, SHEET_SIZES, sheetMm } from '@shared/sheets';

describe('sheet sizes', () => {
  it('lists A4 to A0', () => expect(SHEET_SIZES).toEqual(['A4', 'A3', 'A2', 'A1', 'A0']));
  it('doubles the area at each step up (A series)', () => {
    for (let i = 1; i < SHEET_SIZES.length; i++) {
      const small = SHEET_MM[SHEET_SIZES[i - 1]];
      const big = SHEET_MM[SHEET_SIZES[i]];
      // The A series halves the long side to get the next size: the long side of A(n) is the short side of A(n-1) times 2, within 1 mm of rounding.
      expect(Math.abs(big.w - small.h)).toBeLessThanOrEqual(1);
      expect(Math.abs(big.h - 2 * small.w)).toBeLessThanOrEqual(1);
    }
  });
  it('is landscape by default', () => {
    expect(sheetMm('A3')).toEqual({ w: 420, h: 297 });
    expect(sheetMm('A3', false)).toEqual({ w: 297, h: 420 });
  });
});
