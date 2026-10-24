// Potentials a wire can carry (brief, M1). Names follow IEC 60445 / IEC 60204-1 usage: L1, L2, L3,
// N, PE for AC; L+ and L- for DC mains; 24 V DC with 0 V for control. The list is stored in the
// project so a company can add its own.
import type { Potential } from './model/types';

export const DEFAULT_POTENTIALS: Potential[] = [
  { id: 'L1', label: 'L1', kind: 'ac' },
  { id: 'L2', label: 'L2', kind: 'ac' },
  { id: 'L3', label: 'L3', kind: 'ac' },
  { id: 'N', label: 'N', kind: 'neutral' },
  { id: 'PE', label: 'PE', kind: 'pe' },
  { id: 'L+', label: 'L+', kind: 'dc-plus' },
  { id: 'L-', label: 'L−', kind: 'dc-minus' },
  { id: '24VDC', label: '24 V DC', kind: 'dc-plus' },
  { id: '0V', label: '0 V', kind: 'dc-minus' },
  { id: '110VDC', label: '110 V DC', kind: 'dc-plus' },
];
