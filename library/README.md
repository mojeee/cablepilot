# Library

Symbols, devices, terminals, cables, colour codes, page frames and title blocks as plain JSON data
files. Rules (CLAUDE.md, rules 2 and 9):

- Every file has an `id` equal to its file name (without `.json`), a `kind`, a `source` (standard and
  clause, or the catalogue it comes from) and a `verification` of `primary` (the standard's own text
  was seen) or `secondary` (listed in `docs/to-verify.md`).
- Never add a value you cannot source. Never copy a manufacturer catalogue without permission.
- `npm run check:library` validates every file; CI runs it. Company libraries made with the symbol
  editor (M1) use the same format and the same check.

Kinds known so far: `colour-codes`. New kinds are added to `scripts/check-library.mjs` together with
their first data file.
