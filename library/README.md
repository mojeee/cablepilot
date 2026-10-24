# Library

Symbols, devices, terminals, cables, colour codes, page frames and title blocks as plain JSON data
files. Rules (CLAUDE.md, rules 2 and 9):

- Every file has an `id` equal to its file name (without `.json`), a `kind`, a `source` (standard and
  clause, or the catalogue it comes from) and a `verification` of `primary` (the standard's own text
  was seen) or `secondary` (listed in `docs/to-verify.md`).
- Never add a value you cannot source. Never copy a manufacturer catalogue without permission.
- `npm run check:library` validates every file; CI runs it. Company libraries made with the symbol
  editor (M1) use the same format and the same check.

Kinds known so far: `colour-codes`, `symbol` (`library/symbols/`), `part` (`library/parts/`, generic parts with code,
manufacturer "Generic", data and optional dimensions), `macro` (`library/macros/`, a group of elements saved from a
project) and `template` (company title-block templates). The rules live in `scripts/library-validate.mjs`; new kinds are added there together with their
first data file. `npm run check:library -- <folder>` checks any folder, for example a company library.

Cabinet layout (M6 part 3): a part's `dimensions` (width, height, depth in millimetres) are its body on the plate (a terminal's
width is one terminal; a duct's `w` is its length, `h` and `d` its section; a plate's `d` is its thickness), and an
optional `mount` (`rail`, `plate`, `door`, `field` or `none`) says where it goes; without it the default of its category
applies (`shared/cabinet/size.ts`). Cables may carry `Outer diameter` in their data. A `layout-template` file (company
library, `layouts/`) holds a saved cabinet layout (see `docs/layout-format.md`).

Parts the sizing engine can propose (M6 part 1) carry `data.Type` (`MCB`, `MPCB`, `Contactor`, `Overload relay` or
`Power cable`) and the fields that type needs: `Poles`, `Tripping characteristic` (B, C, D), `Rated current`, `Breaking
capacity` (kA) for an MCB; `Poles`, `Setting range` ("10 - 16 A"), `Breaking capacity` for a motor protective circuit
breaker; `Poles` and `Rated operational current AC-3` for a contactor; `Setting range` for an overload relay; `Cores` and
`Conductor cross-section` for a power cable. A part without them is shown as "data missing" and never suggested.
`npm run check:library` enforces it.

A symbol file has `title` (en, it), `category`, `function`, an optional IEC 81346 `designationLetter`,
`pins` (id, x, y, direction), `graphics` in millimetres on a 2.5 mm grid (y down, origin at the anchor)
and optionally `nfpa` graphics (same pins) for the NFPA 79 / ANSI project setting. The text `{value}` in a
text graphic is replaced by the placed symbol's value (a PLC address). All graphics are our own drawing.
Company symbols saved by the in-app symbol editor go to `company-library/symbols/` in the app's data
folder, in the same format.
