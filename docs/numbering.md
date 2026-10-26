# How numbering works

CablePilot numbers three things for you: **device designations**, **wire numbers** and **terminals**. Each one is a
single command you can undo, and numbers you typed by hand are kept.

## Device designations (IEC 81346)

A designation has up to three aspects: `=function`, `+location` and `-product`, for example `=M1+DS-K3`.

- **Product aspect.** When you place a symbol, it gets the next free number for its letter code on that page's
  function and location: a coil or contactor is `-K`, a breaker `-Q`, a motor `-M`, a terminal `-X`, and so on (the
  letter code comes with each library symbol).
- **Function and location.** A page has a default `=function` and `+location` (page properties). A symbol inherits
  them unless it states its own location, so `-K3` on a page of `+DS` is the device `+DS-K3`.
- **One device, many symbols.** Every symbol and box that carries the same full designation is the same device: a coil
  and its contacts, or the single-line and multi-line symbols of a breaker. They are counted once in the BOM and
  cross-referenced both ways. Change the designation of one representation and all of them follow.
- **Renumber.** **Renumber** (Wires tab, or **Ctrl+Shift+R**) numbers the devices of the project again, per function,
  location and letter code: 1, 2, 3... in reading order (page order, then left to right, top to bottom). All
  representations of a device keep one designation, and its parts, parent assembly and mating connectors follow.
  Renumbering one page keeps devices that also appear on other pages.

Cross-references are shown as `page.column` (`8.3`) or `page-column-row` (`08-E3`), with the page number padded to
the digits you choose (Project settings > Cross-references).

## Wire numbers

**Number wires** (Wires tab, or the command `NUMBER`) gives every wire a number by the scheme and pattern in
**Wires and cables > Numbering**.

- **What shares a number.** Wires connected to each other form a net. A net and every net joined to it by
  interruption points with the same signal name, or through mated connector pins, form one group and share one
  number, across pages.
- **Which pages.** Power, control, PLC, terminal, cable and layout pages are numbered. Single-line pages, data pages
  and report pages are not, and a wire drawn as a bundle carries a label instead of a number.
- **Typed numbers stay.** A number you type on a wire is locked: renumbering keeps it and never gives it twice.

### Schemes

| Scheme | Counter | Default pattern | Example |
|---|---|---|---|
| By potential | one counter per potential (L1, L+, 24 V...) | `{n:3}{suffix}` | `020L+`, `021L+`, `005U` |
| By page and column | one counter per page column | `{page:2}.{col}.{n}` | `08.3.1`, `08.3.2` |
| Sequential | one counter for the project | `{n}` | `1`, `2`, `3` |
| By rung (ladder pages) | one counter per rung | `{rung}{sub}` | `205`, `205A`, `205B` |

Groups are numbered in reading order: the page of the group's first wire, then left to right and top to bottom.

### Pattern tokens

| Token | Meaning |
|---|---|
| `{n}`, `{n:3}` | the counter, optionally padded to 3 digits (`007`) |
| `{page}`, `{page:2}` | the page number of the group's first wire, optionally padded |
| `{col}`, `{row}` | the frame zone of the group's first wire |
| `{potential}` | the potential name (L1, 24VDC...) |
| `{suffix}` | the suffix of the wire class of that potential (Wires and cables > Wire classes) |
| `{rung}` | the line number of the rung on a ladder page (on other pages: page-column) |
| `{sub}` | nothing for the first wire on a rung, then `A`, `B`... |

**Start at** and **Step** set the first number and the increment. A numbering of one page renumbers only the groups
that touch it and keeps the numbers other pages already use.

**Placing a symbol on a numbered wire** splits the wire between the symbol's pins. When the wire had an automatic
number, the page's wires are numbered again in the same undo step, so both pieces get their own numbers.

### Ladder pages

A ladder page (command `LADDER`, or the **Ladder page** box in **Add page** for power, control and PLC pages) has two rails and numbered rungs. Line numbers default to
page × 100 (page 2: 200, 201, 202...). On a ladder page the cross-references are line numbers, and the **By rung**
scheme gives each wire the number of the rung it starts on. These are the usual North American conventions for
NFPA 79 drawings, not requirements of the standard; check them against what your customers expect.

## Terminals

**Number terminals now** (Wires and cables > Numbering) numbers the terminals of every strip 1, 2, 3... in reading
order. Placing a terminal on a strip gives it the next free number of that strip.

## Undo

Every numbering is one command: **Ctrl+Z** brings all the previous numbers back at once.
