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
