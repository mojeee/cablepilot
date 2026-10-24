// Frame zone labels. A frame has column and row zones; their labels are plain lists in the
// template, so any scheme works (A to H, then M to U, skipping I, L, O and Q; rows 0 to 9).

/** Labels from `start` to `end` inclusive, skipping the labels in `skip`. Letters or numbers. */
export function zoneRange(start: string, end: string, skip: string[] = []): string[] {
  const skipSet = new Set(skip.map((s) => s.toUpperCase()));
  const out: string[] = [];
  const numeric = /^\d+$/.test(start) && /^\d+$/.test(end);
  if (numeric) {
    for (let n = Number(start); n <= Number(end) && out.length < 100; n++) if (!skipSet.has(String(n))) out.push(String(n));
    return out;
  }
  if (start.length !== 1 || end.length !== 1) return [];
  for (let c = start.toUpperCase().charCodeAt(0); c <= end.toUpperCase().charCodeAt(0) && out.length < 100; c++) {
    const ch = String.fromCharCode(c);
    if (!skipSet.has(ch)) out.push(ch);
  }
  return out;
}

/** Parses a user-typed list ("A B C", "A,B,C"). */
export function parseZoneLabels(text: string): string[] {
  return text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}

/** The zone label of a position along a frame edge, for cross-references (M2): index of the zone. */
export function zoneIndex(pos: number, start: number, length: number, count: number): number {
  if (count <= 0 || length <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(((pos - start) / length) * count)));
}
