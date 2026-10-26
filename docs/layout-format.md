# Cabinet layout exchange format

The layout of a project (enclosure, mounting plate, rails, ducts, zones, dimension lines and the devices on the plate
and on the door) is exchanged with an ERP or another system as a **JSON** file or a **CSV** file, and drawn as **DXF**.
STEP (3D) is planned for later. The format is versioned; this page describes version 1.

Import and export live in the layout window (Layout tab, Exchange). An import is shown as a preview first
(Accept or Reject in the assistant panel) and is one undo step. Files are read and written in the app's main process,
from a file you pick or from a watched folder (the newest `.json` or `.csv` file in it). The live link with an ERP
for items, stock and reservations is described in [erp-link.md](erp-link.md).

## Coordinates

- Millimetres. `x` and `y` are the top-left corner of the item as seen from the front, measured from the top-left
  corner of the **mounting plate** (items on the door: from the top-left corner of the door). `y` grows downwards.
- The enclosure is at 0, 0; the plate's `x` and `y` are its offset inside the enclosure.
- `width` and `height` are the footprint seen from the front, after the rotation. `depth` is how far the item sticks
  out. `rotation` is in degrees, clockwise (0, 90, 180, 270).
- `z` is the height above the plate surface: 0 for items on the plate; for door devices the depth between plate and
  door. It is written for the 3D side of an ERP and ignored on import (it follows from `mount`).

## JSON

```json
{
  "format": "cablepilot-layout",
  "version": 1,
  "units": "mm",
  "project": "Pump station, two pumps",
  "items": [
    { "type": "enclosure", "designation": "A1", "partCode": "GEN-ENCLOSURE-800X1200X400", "enclosure": "A1",
      "mount": "enclosure", "rail": "", "x": 0, "y": 0, "z": 0, "rotation": 0, "width": 800, "height": 1200, "depth": 400,
      "locked": false, "note": "" },
    { "type": "rail", "designation": "R1", "partCode": "GEN-DIN-RAIL-35MM-1M", "enclosure": "A1", "mount": "plate",
      "rail": "", "x": 80, "y": 107.5, "z": 0, "rotation": 0, "width": 610, "height": 35, "depth": 0, "locked": false, "note": "" },
    { "type": "device", "designation": "+PS-KM1", "partCode": "GEN-CONTACTOR-9A", "enclosure": "A1", "mount": "plate",
      "rail": "R1", "x": 237.5, "y": 100, "z": 0, "rotation": 0, "width": 45, "height": 80, "depth": 85, "locked": false, "note": "" }
  ]
}
```

| Field | Meaning |
|---|---|
| `type` | `enclosure`, `plate`, `rail`, `duct`, `device`, `zone` (no-mount zone), `cover`, `dim` (dimension line: from x, y by width, height; `depth` is its offset) |
| `designation` | A device's full designation (`=function +location -product`); other items: their label (`A1`, `MP1`, `R1`, `D1`) |
| `partCode` | The part code of the item. A device's part comes from the schematic: a different code in the file is reported, the schematic wins |
| `enclosure` | The label of the enclosure the item belongs to |
| `mount` | `enclosure`, `plate` or `door` |
| `rail` | The label of the rail a device sits on |
| `locked` | A locked item stays put when the layout is suggested again |
| `note` | Text of a zone, cover or dimension line |

## CSV

One row per item, with a header row and the columns

`type, designation, part_code, enclosure, mount, rail, x, y, z, rotation, width, height, depth, locked, note`

UTF-8 with a byte order mark; the separator is `;` for Italian projects and `,` otherwise (the files are read either
way). `locked` is `yes` or empty. Decimal numbers use the point.

## What an import does

- **Devices** are matched by designation (a short designation such as `-K1` works when it is unique) and must exist in
  the schematic: the schematic decides which devices there are (rule 1). A device that is on the layout moves; one that
  is not is placed; one that is not in the schematic is skipped with a warning.
- **Other items** are matched by type and label; unknown ones are added. Items that are on the layout but not in the
  file are left alone.
- Everything an import touches counts as placed by hand: the next suggestion keeps it.
- Rail and plate links follow the labels. Part codes of enclosures, plates, rails and ducts are looked up in the
  library and the project's parts.

## DXF

- **2D views** (`...-layout.dxf`): the front, door and side views at real size, side by side, one layer per kind of item:
  `ENCLOSURE`, `PLATE`, `RAILS`, `DUCTS`, `DEVICES`, `ZONES`, `COVERS`, `DIMENSIONS`, `SIDEVIEW`, `NOTES`. The DXF
  command on a layout page exports that page alone.
- **Mounting plate for drilling** (`...-drilling.dxf`): the plate outline with its origin at the plate's bottom-left
  corner, and a circle for every fixing hole on the layers `DRILL_RAIL`, `DRILL_DUCT` and `DRILL_DEVICE`, plus the
  outlines of what is mounted and a note with the hole count. Hole size and spacing are generic assumptions (see
  `docs/to-verify.md`): check them against the data sheets before drilling.

## Dimensions from an ERP item master

Enclosure and device sizes can come from the ERP item master as CSV or XLSX, through the **same column mapping as the
warehouse** (Warehouse window): map the part code and the width, height and depth columns (millimetres). In the
layout window choose **Sizes from an ERP item master**: parts are matched by code (or by a link made in the
warehouse), the changes are shown as a preview, and accepting stores the sizes on the project's copy of each part and
updates the devices on the layout, as one undo step. Rows without a code or with a size that is not a positive number
are reported, never guessed.

## Layout templates

A layout template is a company library file (`company-library/layouts/<id>.json`, kind `layout-template`) with the
enclosure, the plate (offset in the enclosure), rails, ducts, zones and covers (from the plate's corner) and the device
slots (a part on a rail at a distance from the rail's start). Loading a template into a project with no layout adds the
pages and the structure and puts a device of the schematic with the matching part into each slot; the suggestion then
arranges the rest around them.
