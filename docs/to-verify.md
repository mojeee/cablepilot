# To verify

Values that code or data files use but that have not been checked against the primary text of the
standard or the manufacturer document. Nothing here is shipped as a fact: an entry stays until the
owner or a contributor with the standard in hand confirms it and the data file's `verification`
field says `primary`. Format: what, where it is used, what to check.

| Value | Used in | What to check |
| --- | --- | --- |
| Trimmed sheet sizes A4 to A0 (210 × 297 ... 841 × 1189 mm) | `shared/sheets.ts` | Clause of ISO 5457 that lists the trimmed sizes, and its tolerances. The sizes are the ISO 216 A series. |
| Frame margins (20 mm left, 10 mm elsewhere), zone band of 5 mm | `shared/model/defaults.ts` (default template) | ISO 5457 frame, filing-margin and zone values per sheet size; the default template is a placeholder until then. |
| Two-letter colour codes (BK, BN, RD, OG, YE, GN, BU, VT, GY, WH, PK, TQ, GNYE) | `library/colours/iec-60757.json` | The code table and the colour names in IEC 60757 itself (recorded from secondary sources). |
| Title block of 180 x 36 mm with the field set of the default template | `shared/model/defaults.ts` | ISO 7200: required and optional data fields, maximum width, field positions. |
| Symbol families and the part of IEC 60617 each belongs to (parts 2 to 8) | `library/symbols/*.json` (`source`, all `secondary`) | Each symbol's number in IEC 60617 and that our drawing matches its meaning. Graphics are our own drawing, not copies. |
| NFPA 79 / ANSI alternative graphics (contacts, coil, lamp, overload relay, pushbuttons, emergency stop) | `library/symbols/*.json` (`nfpa`) | NFPA 79 and ANSI/IEEE 315 symbol tables: that each alternative is the accepted symbol for the same function. |
| n-conductor tick marks (up to 3 strokes, more than 3 as one stroke and the number) | `shared/draw/page.ts` (`wirePrims`) | IEC 60617 conductor symbols for single-line representation. |
| Designation letter codes (A, B, C, F, G, H, K, M, P, Q, R, S, T, V, X) and the letters chosen per symbol | `shared/numbering.ts`, `library/symbols/*.json` | IEC 81346-2 class letters, current edition; H and P for lamps and instruments, V for diodes, T for rectifiers and converters, G for supplies and batteries. |
| IEC 61439-1 assembly data fields (rated voltages, currents, Icw, RDF, forms of separation, IP) | `shared/forms.ts` | Clause numbers of IEC 61439-1 clause 5 and Annex C; the form presets cite clause level only. |
| Smallest drawn line width 0.13 mm | `shared/pdf.ts` | ISO 128-2 line-width series (clause on line widths). |
| Rating classes named by the generic parts (contactor AC-3 and DC-1 currents, MCB curves and ratings, motor protection ranges, terminal cross-sections, cable sizes, battery cell 2 V / 100 Ah, transformer 5 kVA Dyn11 and Yyn0) | `library/parts/*.json` (`secondary`) | That each class is a normal rating of its kind in the standard it belongs to (IEC 60947 family, IEC 60898-1, IEC 60364-5-52 for cables, IEC 60076 vector groups) and that the part title does not claim more than a class. They are generic definitions, not datasheets. |
| Generic dimensions: MCB width of 17.5 mm per pole, height 90 mm, depth 70 mm; enclosure sizes as named | `library/parts/generic-mcb-*.json`, `generic-enclosure-*.json` | DIN 43880 module width and heights, IEC 60529 does not apply. Enclosure sizes are the sizes in the title. Used by the cabinet layout in M6. |
| Designation letter Z for filters and limiters; B for sensors; X for terminals and connectors | `shared/numbering.ts`, `library/symbols/emi-filter.json`, `hall-sensor.json` | IEC 81346-2 class letters, current edition. |
| Interruption point symbol (arrow with the signal name) and the conductor-through-sensor drawing of the Hall sensor | `library/symbols/interruption-point.json`, `hall-sensor.json` | IEC 61082-1 treatment of continuations between sheets and IEC 60617 Hall element symbols. |
| Terminal marks U1 V1 W1 / U2 V2 W2 and the star-delta connections used by the pump sample | `library/symbols/motor-3ph-6.json`, `tests/support/samples.ts` | IEC 60034-8 terminal markings of a six-terminal motor; the delta pairs U1-W2, V1-U2, W1-V2. |
| Contact image glyphs (make, break, power contact) and the position text under a coil | `shared/draw/page.ts` (`contactImage`) | IEC 61082 / IEC 81346 practice for contact cross-references and the contact-state note. |

