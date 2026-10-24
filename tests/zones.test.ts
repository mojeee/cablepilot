import { describe, expect, it } from 'vitest';
import { parseZoneLabels, zoneIndex, zoneRange } from '@shared/model/zones';

describe('frame zone labels', () => {
  it('builds ranges and skips letters', () => {
    expect(zoneRange('A', 'H')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(zoneRange('M', 'U', ['O', 'Q'])).toEqual(['M', 'N', 'P', 'R', 'S', 'T', 'U']);
    expect(zoneRange('A', 'F', ['I', 'O'])).toHaveLength(6);
    expect(zoneRange('0', '9')).toHaveLength(10);
    expect(zoneRange('1', '8', ['4'])).toEqual(['1', '2', '3', '5', '6', '7', '8']);
  });
  it('parses typed lists', () => {
    expect(parseZoneLabels('A B, C;D')).toEqual(['A', 'B', 'C', 'D']);
  });
  it('finds the zone of a position', () => {
    expect(zoneIndex(25, 20, 80, 8)).toBe(0);
    expect(zoneIndex(99, 20, 80, 8)).toBe(7);
    expect(zoneIndex(500, 20, 80, 8)).toBe(7);
  });
});
