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
| 1 | Sheet index with per-sheet revision matrix, revision list (rev, date, description, drawn, checked, approved), issue status boxes (for proposal / for approval / for construction / as built), quantity of units to build, customer approval and signature block | Missing (only a "contents" report) | M4 (revisions), M1 (page templates): done in M4 (generated cover sheet with the revision matrix of the last six revisions, revision list, status boxes, units to build, approval and signature block) |
| 2 | General data sheets: mechanical, electrical (rated voltages, Icw, IEC 61439-2, insulation class, RDF), battery and DC-output data, with YES/NO tick boxes; conductor colour table (IEC 60445 codes, function, wire type, cross-section); wire-number suffix table | Missing | M1 (project data pages), M3 (generated colour/suffix tables): done in M3 |
| 3–4 | Symbol legend, including company symbols (monitoring units, switch, RJ45, switching block) | Missing (no legend page, no in-app symbol editor) | M1 (symbol editor), M3 (generated legend): done in M3, used symbols only, company symbols included |
| 5 | Legend of the company's standard boards and modules: detailed black boxes with named pins | Done in M2 (black boxes with pins, company macros) | M2 (macros) |
| 6 | Single-line diagram: n-conductor ticks, dashed module outlines, measurement markers, warning signs, notes | Missing (no single-line page type) | M1 (single-line pages), M2 (one device, several representations) |
| 7–9 | Multi-line power and control: 3-phase input, transformers with vector group, MCBs, fuse switch, phase-sequence relay with contact image and contact-state note, power modules, hall sensors, diode, DC contactor, battery string, flat-cable connectors, cross-references like `[08-E3]`, wire numbers with potential suffix (`020L+`, `005U`: done in M3), wire bundles labelled "10 mm² BK" and conductors drawn in their colour (done in M3), location codes (`+DS`, `+MO`, `+PF`), warning signs | Partial (schematic editor planned; missing: wire numbers with suffix, coloured wires, page-column-row references, connectors with pins, nested assemblies, DC/power-electronics library) | M1, M2, M3 |
| 10 | PLC interface and alarm relays: boards with numbered connector pins, 40- and 10-pole flat cables, RJ45 Cat 5 cable, DC/DC converters, sensor harness cores coloured WH/YE/GN/BN, relay module with function text per contact, a device photo | Partial (cables with cores planned; missing: flat cables, patch cables, connector pin lists, images on pages) | M1 (images), M2 (connectors), M3 (cable types): cores with colours, ribbon and RJ45 patch cables and connector pin lists done in M3 |
| 11 | Terminal strips with destination, function text, terminal part and strip length; tightening-torque table by cross-section; device nameplates ("targhette") | Partial (terminal diagrams planned; missing: torque table, nameplate list) | M3: done (terminal diagram with strip length, torque table with sources, nameplates drawn and listed) |
| 12 | Mounting plate front view with dimensions, side view with device depths, hatched no-mount zones, cover panel, door HMI with cable-length note | Partial (2D layout and 3D planned; missing: dimension lines, side view, keep-out zones, notes) | M6: done in M6 part 3 (front view to scale with dimension lines, side view with device depths, hatched no-mount zones, covers, notes, door page with the door devices and the cable-length note; layout pages print in the PDF set at a standard scale) |
| 13 | BOM: designation, position (sheet-column-row), quantity, part code, description, make-or-buy type, manufacturer, notes; several parts per device (module plus capacitors); parts with no designation (mounting plate, wiring kit) | Done in M2 (was: BOM planned; missing: several parts per device, project-level parts, user columns) | M2 |

## Cross-cutting items

| Item | Status before | Now in |
|---|---|---|
| Company title block: logo, drawing number, internal order, client, product description, sheet title, issue date, sheet / next sheet / total, drawn by, revision boxes | Partial ("IEC title block") | M1 (title-block templates) |
| Copyright notice in the frame margin | Missing | M1 (frame templates) |
| Zone labels that skip I and O (A–H, M–U here) and rows 0–9 | Partial | M1 (configurable zones) |
| Drawing style: designations and wire numbers in red, line weights, CAD font | Missing | M1 (drawing styles) |
| Drawing language different from the UI language (Italian drawings, English UI) | Missing | M1 (project drawing language) |
| Free annotation: text (rotated, multi-line), lines, rectangles, dashed outlines, tables, images, warning signs | Missing | M1 |
| Revisions: issue a revision, list which sheets changed, revision index per sheet, compare two revisions | Missing | M4: done (issue with snapshot, changed pages, revision index in the title block and on the cover, comparison of pages, devices, wires and parts) |
| Generic parts for DC and power electronics: batteries, diodes, rectifier and inverter modules, DC/DC converters, hall-effect current sensors, EMI filters, transformers with vector group, phase-monitoring relays, HMI, network switch, RJ45 | Done in M2 (was: library was focused on motor control) | M2 (library), rule 9 |
| Editing an existing drawing like this one later | Covered for drawings made in CablePilot (open JSON format, undo). Importing an existing PDF or DXF set as an *intelligent* project is not planned | "After release 1" in the brief |

## Verdict

With the original brief, CablePilot could have drawn the schematic pages and produced terminal, cable
and wire lists and a BOM, but it could not reproduce this set completely. The main gaps were revision
control and the cover sheet, single-line pages, company title blocks and drawing styles, free
annotation and images, connectors with pins, several parts per device, wire numbers with suffixes,
generated legends and data sheets, nameplate lists, and dimensioned layout views. All of these are now
in the brief and the roadmap. M8's launch checklist includes rebuilding a set of this kind (the third
sample project) and ticking every row above.

## Launch check (M8)

The DC battery-charger sample (`samples/dc-charger.cablepilot.json`, built by `tests/support/samples.ts`) printed
as one vector PDF: 27 A3 landscape sheets in the company frame and title block (logo, client, drawing number, order,
sheet / next / total, revision), Italian drawing language, zones A–H M–U and 0–9, designations and wire numbers in
red. It opens with a clean electrical rule check and its issued revisions up to date (`tests/samples.test.ts`).
Sheet numbers below are the printed set's.

| Row | Evidence in the printed set | Result |
|---|---|---|
| 1 Cover | Sheet 1: sheet index with the revision matrix, revision list, issue status boxes, units to build, approval and signature block; sheet 2 contents | Done |
| 2 Data sheets, colours, suffixes | Sheets 3–4 general, battery and DC-output data with YES/NO boxes; sheet 23 conductor colours (IEC 60445 / IEC 60757); sheet 24 wire-number suffixes | Done |
| 3–4 Symbol legend | Sheets 21–22, used symbols only, with the company symbol `-X30` (RJ45 service socket, embedded in the project) | Done |
| 5 Board legend | Not a separate sheet: the boards are black boxes with named pins on sheet 9 (`-X20`, `-X21`, `-A2`, `-A5`) and their pins are listed on sheets 17–18 | Done, laid out differently |
| 6 Single-line | Sheet 5: n-conductor ticks, dashed module outlines, warning sign, notes, a measurement (`-P1` voltmeter), the battery in its own location `+BT` | Done |
| 7–9 Multi-line | Sheets 6–8: 3-phase input, transformer with vector group, MCBs, battery fuse, rectifier modules, hall sensor `-B1`, diode, DC contactor `-KM1`, battery, the phase-control relay `-K1` with its contact image and the note "contacts shown with the relay in alarm", cross-references like `[07-P4]`, wire numbers with suffixes (`001L+`), coloured conductors, a bundle labelled "10 mm² BK", locations `+DS` and `+BT`, warning signs | Done. A combined fuse switch-disconnector is not a library symbol: the sample draws a fuse; a company can add its own with the symbol editor |
| 10 PLC interface | Sheet 9: boards with numbered pins, a ribbon cable, an RJ45 Cat 5 patch cable, the DC/DC converter `-U3` (sheet 7), the sensor cable `-W3` with BN/WH/GN cores, a device illustration (HMI front view) | Done. The sample's ribbon has 4 poles, not 40: the pole count is a property of the connector |
| 11 Terminals, torque, nameplates | Sheet 10 terminal diagram with strip length; sheet 25 tightening torques with sources; sheet 26 nameplates | Done |
| 12 Layout | Sheets 12–14: mounting plate to scale 1:10 with dimension lines, hatched cable-entry zone and a protection cover; door with the HMI and the cable-length note; side view with device depths | Done |
| 13 BOM | Sheets 19–20: designation, position, quantity, part code, description, type, manufacturer; several parts per device and project-level parts | Done |
| Wire and cable lists, PLC I/O | Sheet 11 cables, sheets 15–16 wires, sheet 27 PLC I/O | Done |
| Cross-cutting rows | Title block with logo, copyright in the margin, skipped zone letters, drawing style, drawing language, free annotation and images, revisions, DC library: all visible on the sheets above | Done |

Importing an existing PDF or DXF set as an intelligent project stays "after release 1" (see the roadmap).
