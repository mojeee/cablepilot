# To verify

Values that code or data files use but that have not been checked against the primary text of the
standard or the manufacturer document. Nothing here is shipped as a fact: an entry stays until the
owner or a contributor with the standard in hand confirms it and the data file's `verification`
field says `primary`. Format: what, where it is used, what to check.

| Value | Used in | What to check |
| --- | --- | --- |
| Trimmed sheet sizes A4 to A0 (210 × 297 ... 841 × 1189 mm) | `shared/sheets.ts` | Clause of ISO 5457 that lists the trimmed sizes, and its tolerances. The sizes are the ISO 216 A series. |
| Frame margins (20 mm left, 10 mm elsewhere) | `app/renderer/components/CanvasView.tsx` (placeholder drawing only) | ISO 5457 frame and filing-margin values per sheet size, before frame templates ship in M1. |
| Two-letter colour codes (BK, BN, RD, OG, YE, GN, BU, VT, GY, WH, PK, TQ, GNYE) | `library/colours/iec-60757.json` | The code table and the colour names in IEC 60757 itself (recorded from secondary sources). |
