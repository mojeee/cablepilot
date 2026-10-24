# Reference drawing set check

A real production drawing set was used to check whether the plan in `docs/brief.md` can produce a
complete, workshop-ready set that the user can keep editing afterwards. The set is a 13-sheet, A3
landscape, Italian-language drawing for a 110 V DC battery charger / rectifier panel: two rectifier
modules, a battery string, a switching block, a PLC interface board, alarm relays and an HMI. The source
document is a third party's copyrighted drawing: it is **not** stored in this repository, and nothing
from it (company name, drawing numbers, part codes) may be copied into the product, the samples or the
website. The third sample project, a DC battery-charger panel (see the brief), rebuilds the same *kind*
of panel with generic parts.

Legend: **Covered**: the original brief already planned it. **Partial**: planned, but not to the level
the set needs. **Missing**: not in the original brief. Every Partial and Missing item has now been
added to the brief, in the milestone named in the last column.

## Sheets in the set

| Sheet | Content | Status before | Now in |
|---|---|---|---|
| 1 | Sheet index with per-sheet revision matrix, revision list (rev, date, description, drawn, checked, approved), issue status boxes (for proposal / for approval / for construction / as built), quantity of units to build, customer approval and signature block | Missing (only a "contents" report) | M4 (revisions), M1 (page templates) |
| 2 | General data sheets: mechanical, electrical (rated voltages, Icw, IEC 61439-2, insulation class, RDF), battery and DC-output data, with YES/NO tick boxes; conductor colour table (IEC 60445 codes, function, wire type, cross-section); wire-number suffix table | Missing | M1 (project data pages), M3 (generated colour/suffix tables) |
| 3–4 | Symbol legend, including company symbols (monitoring units, switch, RJ45, switching block) | Missing (no legend page, no in-app symbol editor) | M1 (symbol editor), M3 (generated legend) |
| 5 | Legend of the company's standard boards and modules: detailed black boxes with named pins | Partial (black boxes in M2, but no reusable company macros) | M2 (macros) |
| 6 | Single-line diagram: n-conductor ticks, dashed module outlines, measurement markers, warning signs, notes | Missing (no single-line page type) | M1 (single-line pages), M2 (one device, several representations) |
| 7–9 | Multi-line power and control: 3-phase input, transformers with vector group, MCBs, fuse switch, phase-sequence relay with contact image and contact-state note, power modules, hall sensors, diode, DC contactor, battery string, flat-cable connectors, cross-references like `[08-E3]`, wire numbers with potential suffix (`020L+`, `005U`), wire bundles labelled "10 mm² BK", conductors drawn in their colour, location codes (`+DS`, `+MO`, `+PF`), warning signs | Partial (schematic editor planned; missing: wire numbers with suffix, coloured wires, page-column-row references, connectors with pins, nested assemblies, DC/power-electronics library) | M1, M2, M3 |
| 10 | PLC interface and alarm relays: boards with numbered connector pins, 40- and 10-pole flat cables, RJ45 Cat 5 cable, DC/DC converters, sensor harness cores coloured WH/YE/GN/BN, relay module with function text per contact, a device photo | Partial (cables with cores planned; missing: flat cables, patch cables, connector pin lists, images on pages) | M1 (images), M2 (connectors), M3 (cable types) |
| 11 | Terminal strips with destination, function text, terminal part and strip length; tightening-torque table by cross-section; device nameplates ("targhette") | Partial (terminal diagrams planned; missing: torque table, nameplate list) | M3 |
| 12 | Mounting plate front view with dimensions, side view with device depths, hatched no-mount zones, cover panel, door HMI with cable-length note | Partial (2D layout and 3D planned; missing: dimension lines, side view, keep-out zones, notes) | M6 |
| 13 | BOM: designation, position (sheet-column-row), quantity, part code, description, make-or-buy type, manufacturer, notes; several parts per device (module plus capacitors); parts with no designation (mounting plate, wiring kit) | Partial (BOM planned; missing: several parts per device, project-level parts, user columns) | M2 |

## Cross-cutting items

| Item | Status before | Now in |
|---|---|---|
| Company title block: logo, drawing number, internal order, client, product description, sheet title, issue date, sheet / next sheet / total, drawn by, revision boxes | Partial ("IEC title block") | M1 (title-block templates) |
| Copyright notice in the frame margin | Missing | M1 (frame templates) |
| Zone labels that skip I and O (A–H, M–U here) and rows 0–9 | Partial | M1 (configurable zones) |
| Drawing style: designations and wire numbers in red, line weights, CAD font | Missing | M1 (drawing styles) |
| Drawing language different from the UI language (Italian drawings, English UI) | Missing | M1 (project drawing language) |
| Free annotation: text (rotated, multi-line), lines, rectangles, dashed outlines, tables, images, warning signs | Missing | M1 |
| Revisions: issue a revision, list which sheets changed, revision index per sheet, compare two revisions | Missing | M4 |
| Generic parts for DC and power electronics: batteries, diodes, rectifier and inverter modules, DC/DC converters, hall-effect current sensors, EMI filters, transformers with vector group, phase-monitoring relays, HMI, network switch, RJ45 | Partial (library was focused on motor control) | M2 (library), rule 9 |
| Editing an existing drawing like this one later | Covered for drawings made in CablePilot (open JSON format, undo). Importing an existing PDF or DXF set as an *intelligent* project is not planned | "After release 1" in the brief |

## Verdict

With the original brief, CablePilot could have drawn the schematic pages and produced terminal, cable
and wire lists and a BOM, but it could not reproduce this set completely. The main gaps were revision
control and the cover sheet, single-line pages, company title blocks and drawing styles, free
annotation and images, connectors with pins, several parts per device, wire numbers with suffixes,
generated legends and data sheets, nameplate lists, and dimensioned layout views. All of these are now
in the brief and the roadmap. M8's launch checklist includes rebuilding a set of this kind (the third
sample project) and ticking every row above.
