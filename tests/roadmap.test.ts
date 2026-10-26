// The website reads docs/roadmap.md (scripts/build-site.mjs): its headings and boxes must keep their shape.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const roadmap = readFileSync(join(__dirname, '..', 'docs/roadmap.md'), 'utf8');
const headings = roadmap.split('\n').filter((l) => l.startsWith('## '));

describe('docs/roadmap.md', () => {
  it('has a heading for M0 to M9', () => {
    for (let n = 0; n <= 9; n++) expect(headings.some((h) => new RegExp(`^## M${n}\\b`).test(h))).toBe(true);
  });
  it('has the M7-AI Assistant heading the site reads', () => expect(headings).toContain('## M7-AI Assistant'));
  it('has the release section the site reads', () => expect(headings.some((h) => /^## M8 Release/.test(h))).toBe(true));
  it('has M0 to M7 fully ticked (the AI assistant included) and the M8 release not out yet', () => {
    const section = (id: string) => roadmap.split(new RegExp(`^## ${id}\\b.*$`, 'm'))[1].split(/^## /m)[0];
    expect(section('M0')).not.toMatch(/- \[ \]/);
    expect(section('M1')).not.toMatch(/- \[ \]/);
    expect(section('M2')).not.toMatch(/- \[ \]/);
    expect(section('M3')).not.toMatch(/- \[ \]/);
    expect(section('M4')).not.toMatch(/- \[ \]/);
    expect(section('M5')).not.toMatch(/- \[ \]/);
    expect(roadmap.split(/^## M6-Sizing and warehouse.*$/m)[1].split(/^## /m)[0]).not.toMatch(/- \[ \]/);
    expect(roadmap.split(/^## M6-CAD workspace with the AI inside.*$/m)[1].split(/^## /m)[0]).not.toMatch(/- \[ \]/);
    expect(roadmap.split(/^## M6 Cabinet layout.*$/m)[1].split(/^## /m)[0]).not.toMatch(/- \[ \]/);
    expect(roadmap.split(/^## M7-AI Assistant.*$/m)[1].split(/^## /m)[0]).not.toMatch(/- \[ \]/);
    // Release 1 is under way: some boxes may be ticked, but it is out only when all are (the site reads that).
    const m8 = roadmap.split(/^## M8 Release.*$/m)[1].split(/^## /m)[0];
    expect(m8).toMatch(/- \[ \]/);
  });
});
