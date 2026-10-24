// Defaults of the wire-class table and of wire numbering (shared/wires.ts uses them).
import type { NumberingSettings, WireClass } from './types';

/**
 * The default wire-class table. A company edits it (project.wireClasses). Colours follow the usual
 * practice of IEC 60204-1 clause 13.2 (protective conductor GNYE, neutral blue, power circuits
 * black, control circuits red or blue); cross-sections and the type are placeholders. Every value
 * is listed in docs/to-verify.md and none is shipped as a fact.
 */
export const DEFAULT_WIRE_CLASSES: WireClass[] = [
  { id: 'L1', colour: 'BK', crossSection: '2.5', type: 'H07V-K', suffix: 'L1' },
  { id: 'L2', colour: 'BK', crossSection: '2.5', type: 'H07V-K', suffix: 'L2' },
  { id: 'L3', colour: 'BK', crossSection: '2.5', type: 'H07V-K', suffix: 'L3' },
  { id: 'N', colour: 'BU', crossSection: '2.5', type: 'H07V-K', suffix: 'N' },
  { id: 'PE', colour: 'GNYE', crossSection: '2.5', type: 'H07V-K', suffix: 'PE' },
  { id: 'L+', colour: 'BK', crossSection: '2.5', type: 'H07V-K', suffix: 'L+' },
  { id: 'L-', colour: 'BK', crossSection: '2.5', type: 'H07V-K', suffix: 'L-' },
  { id: '24VDC', colour: 'BU', crossSection: '1.5', type: 'H07V-K', suffix: 'P' },
  { id: '0V', colour: 'BU', crossSection: '1.5', type: 'H07V-K', suffix: 'M' },
  { id: '110VDC', colour: 'BK', crossSection: '1.5', type: 'H07V-K', suffix: 'P' },
  { id: 'signal', colour: 'BK', crossSection: '1.5', type: 'H07V-K', suffix: '' },
];

export const NUMBERING_PRESETS: Record<NumberingSettings['scheme'], string> = {
  sequential: '{n}',
  potential: '{n:3}{suffix}',
  'page-column': '{page:2}.{col}.{n}',
};
export const DEFAULT_NUMBERING: NumberingSettings = { scheme: 'potential', pattern: NUMBERING_PRESETS.potential, start: 1, step: 1 };

