# Project file format

A CablePilot project is one UTF-8 text file named `<name>.cablepilot.json`. It is plain, documented JSON: you can
read it, keep it in Git, compare two versions line by line, and write your own tools around it. No lock-in: the same
data also leaves the app as PDF, DXF, CSV and XLSX.

- **Schema:** [`shared/schema/project.schema.json`](../shared/schema/project.schema.json) (JSON Schema). Every sample
  project is checked against it in the tests.
- **Current format version:** 7. The version is the `version` field at the top of the file.

## Stable, diff-friendly writing

The file is written the same way every time, so a change in the drawing gives a small change in the file:

- keys always in the same order, two-space indentation, a newline at the end;
- short objects and arrays on one line (up to 100 characters), longer ones expanded one item per line;
- lists sorted where order has no meaning (device data by designation, cables by designation), and kept in drawing
  order where it has (pages, elements on a page);
- no timestamps or machine-specific paths inside the project.

## What is in the file

| Field | Contents |
|---|---|
| `format`, `version` | always `"cablepilot-project"`, and the format version |
| `id`, `name` | the project's id (stays the same for its whole life) and its name |
| `settings` | drawing language, symbol standard (IEC 60617 or NFPA 79 / ANSI), drawing style, default sheet size and template, cross-reference format, BOM settings, numbering, wire colours, installation method, supply data, PLC addressing, cabinet layout defaults |
| `properties` | project data printed in the title block and on the cover: client, product, order and drawing numbers, drawn / checked / approved, issue date, revision... |
| `assembly` | assembly data for the data sheets (IEC 61439): rated voltages, Icw, IP degree... |
| `templates` | the company frames and title blocks used by the project, stored in it so it opens anywhere |
| `potentials` | the potentials (L1, L2, L3, N, PE, L+, L-, 24 V DC, 0 V...) with their types |
| `pages` | the pages, in order: type, title in each language, sheet size, template, default function and location, and the elements on the page |
| `assets` | images used on pages (logos, photos), embedded |
| `symbols`, `parts` | the company symbols and library parts the project uses, embedded so the project opens on a computer without your company library |
| `devices` | data kept beside the drawing for each device: parts and quantities, user fields, parent assembly, load data for sizing |
| `projectParts` | parts with no designation (mounting plate, wiring kit), in the BOM only |
| `wireClasses`, `wireTypes`, `cables` | the company wire-class table (function, colour, cross-section, type, suffix), named wire types, and cables with their cores |
| `layers` | layer state, colour and line type |
| `issueStatus`, `revisions` | the issue status of the set and every issued revision with its snapshot (pages, devices, wires and parts), used for the revision index and comparisons |

### Elements on a page

Each element has an `id`, a `kind` and its own fields, in page millimetres (origin top left, y downwards):

`symbol` (library symbol, position, rotation, mirror, designation, location, function text, value), `box` (black box
or connector with pins), `wire` (orthogonal polyline, potential, number, wire type, cable and core), `junction`,
`text`, `line`, `rect`, `circle`, `table`, `image`, `warning` (warning sign), `form` (a data sheet bound to project
fields), `report` (a live report printed on the page) and `cab` (an item of the cabinet layout).

Reports, cross-references, the BOM and the terminal and cable lists are **not** stored: they are computed from the
schematic every time, so they can never disagree with it.

## Versions and migrations

When the format changes, the version goes up by one and a migration turns version *n* into *n + 1*. Opening an older
file runs every migration in turn, in memory; the file is written in the new version only when you save. A file from a
newer CablePilot is refused with a plain message (update the app), never half-read. A damaged file is reported with
what is wrong and is not changed.

## Next to the project

These live in CablePilot's data folder on your computer, not in the project:

- **Autosave and crash recovery:** a copy while you work; after a crash, CablePilot offers to bring it back.
- **History:** a daily backup and the versions you name (**History**), compared with the working copy and restored as
  one undo step.
- **Company library:** your own symbols, templates, macros, parts and layout templates, as data files in the same
  format as the built-in library.
- **Settings:** language, theme and panel layout; API keys and ERP passwords are encrypted by the operating system and
  never written in plain text.

## Exchange formats

- **PDF:** the drawing set or one page, vector, at true scale.
- **DXF:** pages in and out; the mounting plate for drilling.
- **CSV and XLSX:** every list (terminals, cables, wires, BOM, PLC I/O, markers, nameplates, picking list).
- **Cabinet layout:** documented JSON and CSV, see [layout exchange format](layout-format.md).
- **ERP:** items and stock in, reservation requests out, see [ERP link](erp-link.md).
- **PLC tag lists:** TIA Portal XML and CODESYS text, out and in with a preview.
