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
