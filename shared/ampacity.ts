// Current-carrying capacity of conductors for the cross-section check (rule 5, IEC 60364-5-52).
//
// Source: IEC 60364-5-52, Annex B, Table B.52-5 (current-carrying capacities in amperes for the methods
// of installation of Table A.52-3, PVC insulation, three loaded conductors, copper, conductor
// temperature 70 degrees C, ambient 30 degrees C). The numbers below were recorded from secondary
// sources and have NOT been checked against the standard text: they are listed in docs/to-verify.md and
// every finding that uses them says so. The check shows its assumptions and does not replace the
// engineer's verification (CLAUDE.md, rule 2).

export const CROSS_SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35] as const;

/** Installation methods of IEC 60364-5-52 Table A.52-3 that the check knows, with a short description. */
export const INSTALLATION_METHODS = ['A1', 'B1', 'B2', 'C', 'E'] as const;
export type InstallationMethod = (typeof INSTALLATION_METHODS)[number];
export const METHOD_TEXT: Record<InstallationMethod, { en: string; it: string }> = {
  A1: { en: 'Single-core conductors in conduit in a thermally insulating wall', it: 'Conduttori unipolari in tubo in parete termicamente isolante' },
  B1: { en: 'Single-core conductors in conduit or trunking on a wall (wiring duct)', it: 'Conduttori unipolari in tubo o canale su parete (canalina)' },
  B2: { en: 'Multicore cable in conduit or trunking on a wall', it: 'Cavo multipolare in tubo o canale su parete' },
  C: { en: 'Cable clipped direct to a wall', it: 'Cavo fissato direttamente a parete' },
  E: { en: 'Multicore cable in free air (cable tray)', it: 'Cavo multipolare in aria libera (passerella)' },
};

/** Amperes per cross-section (CROSS_SECTIONS order), by method. Unverified: see the header and docs/to-verify.md. */
export const CAPACITY_3_LOADED_PVC_CU: Record<InstallationMethod, readonly number[]> = {
  A1: [13.5, 18, 24, 31, 42, 56, 73, 89],
  B1: [15.5, 21, 28, 36, 50, 68, 89, 110],
  B2: [15, 20.5, 27, 34, 46, 62, 80, 99],
  C: [17.5, 24, 32, 41, 57, 76, 96, 119],
  E: [18.5, 25, 34, 43, 60, 80, 101, 126],
};
/** The table values are not verified against the primary text yet. */
export const AMPACITY_VERIFIED = false;

export const isMethod = (m: string): m is InstallationMethod => (INSTALLATION_METHODS as readonly string[]).includes(m);

/** Capacity in amperes of a cross-section (mm²) for a method; undefined when the table has no such size. */
export function capacityOf(method: string, xs: number): number | undefined {
  if (!isMethod(method)) return undefined;
  const i = CROSS_SECTIONS.findIndex((c) => c === xs);
  return i < 0 ? undefined : CAPACITY_3_LOADED_PVC_CU[method][i];
}

/** The smallest tabulated cross-section whose capacity is at least `amps`; undefined when none (above the table). */
export function minCrossSection(method: string, amps: number): number | undefined {
  return CROSS_SECTIONS.find((c) => (capacityOf(method, c) ?? 0) >= amps);
}

// ---- correction factors (M6 part 1, sizing) --------------------------------------------------------
// Both tables below were recorded from secondary sources and have NOT been checked against the standard
// text: they are listed in docs/to-verify.md and every sizing result that uses them says so.

/**
 * Correction factors for ambient air temperatures other than 30 degrees C, PVC insulation (70 degrees C
 * conductor): IEC 60364-5-52, Table B.52-14 ("Correction factors for ambient air temperatures other than
 * 30 degrees C to be applied to the current-carrying capacities for cables in the air"). Temperature, factor.
 */
export const AMBIENT_FACTOR_PVC: readonly (readonly [number, number])[] = [
  [10, 1.22], [15, 1.17], [20, 1.12], [25, 1.06], [30, 1.0], [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71], [55, 0.61], [60, 0.5],
];
/**
 * Reduction factors for grouping of circuits "bunched in air, on a surface, embedded or enclosed":
 * IEC 60364-5-52, Table B.52-17, item 1. Number of circuits (or multicore cables), factor. For method C
 * (single layer on a wall) the table has more favourable factors in item 2; item 1 is used for every method,
 * which is conservative. Method E (perforated trays) has its own tables, not shipped: it has no grouping factor here.
 */
export const GROUPING_FACTOR: readonly (readonly [number, number])[] = [
  [1, 1.0], [2, 0.8], [3, 0.7], [4, 0.65], [5, 0.6], [6, 0.57], [7, 0.54], [8, 0.52], [9, 0.5], [12, 0.45], [16, 0.41], [20, 0.38],
];
/** The correction-factor tables are not verified against the primary text yet. */
export const CORRECTION_VERIFIED = false;

/** Ambient factor for a temperature in degrees C: exact table steps only (5 K), no extrapolation; undefined when outside 10 to 60 or between steps. */
export function ambientFactor(tempC: number): number | undefined {
  return AMBIENT_FACTOR_PVC.find(([t]) => t === tempC)?.[1];
}
/**
 * Grouping factor for n circuits: tabulated counts exactly, and the next higher tabulated count in between (for
 * example 10 circuits use the factor of 12), which errs on the safe side. undefined for method E with more than
 * one circuit, for more than 20 circuits and for n < 1.
 */
export function groupingFactor(method: string, n: number): number | undefined {
  if (!Number.isInteger(n) || n < 1 || n > 20) return undefined;
  if (n === 1) return 1;
  if (method === 'E') return undefined;
  return GROUPING_FACTOR.find(([c]) => c >= n)?.[1];
}

/** Capacity Iz = table value x ambient factor x grouping factor; undefined when a table does not cover the input. */
export function correctedCapacity(method: string, xs: number, ambient: number, grouping: number): { iz: number; table: number; kT: number; kG: number } | undefined {
  const table = capacityOf(method, xs), kT = ambientFactor(ambient), kG = groupingFactor(method, grouping);
  if (table === undefined || kT === undefined || kG === undefined) return undefined;
  return { iz: Math.round(table * kT * kG * 100) / 100, table, kT, kG };
}

/** The smallest tabulated cross-section whose corrected capacity is at least `amps`. */
export function minCorrectedCrossSection(method: string, amps: number, ambient: number, grouping: number): number | undefined {
  return CROSS_SECTIONS.find((c) => (correctedCapacity(method, c, ambient, grouping)?.iz ?? 0) >= amps);
}
