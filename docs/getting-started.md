# Getting started

CablePilot is a desktop app for the electrical design of machines and control panels: multi-page schematics with
IEC symbols, reference designations, cross-references and wire numbers; terminal, cable and wire lists, PLC I/O lists
and the BOM generated from the schematic; a cabinet layout in 2D and 3D; and a PDF drawing set in your company's
frame and title block. It runs on your computer, needs no account and works offline.

## Install

Download the file for your computer from the [latest release](https://github.com/mojeee/cablepilot/releases/latest):

| Computer | File |
|---|---|
| Mac with Apple Silicon (M1 and later) | `CablePilot-mac-arm64.dmg` |
| Mac with an Intel processor | `CablePilot-mac-x64.dmg` |
| Windows 10 or 11 (64-bit) | `CablePilot-win-x64.exe` |
| Linux (64-bit) | `CablePilot-linux-x86_64.AppImage` |

The builds are not signed yet. On a Mac, open the app the first time with right-click > **Open** and confirm. On
Windows, choose **More info > Run anyway** if SmartScreen warns. On Linux, make the AppImage executable
(`chmod +x CablePilot-linux-x86_64.AppImage`) and run it.

## Your first ten minutes

1. **Open a sample.** Choose **Sample projects** in the top bar: the conveyor with a direct-on-line starter, the pump
   station or the 110 V DC battery charger (27 pages). Every feature can be tried on them.
2. **Move around.** The page list is on the left. Zoom with the mouse wheel, pan with the middle button or
   Space + drag, and press **F** (or **Fit page** in the status bar) to see the whole sheet.
3. **Place a symbol.** Search the symbol list (press **/**), click a symbol, click on the page. The designation is
   given automatically (`-K1`, `-Q2`...), following IEC 81346. **R** rotates and **M** mirrors while placing.
4. **Draw a wire.** Press **W**, click from pin to pin, **Enter** to finish. A symbol placed on an existing wire splits
   it between its pins.
5. **Make a device.** Give a contact the same designation as a coil: they become one device, and the cross-references
   appear on both (`08-E3` or `8.3`, as set in the project settings).
6. **Give it a part.** In **Properties**, pick a part from the library: the BOM counts it at once.
7. **Number the wires.** **Wires > Number wires** uses your pattern (by potential, by page and column, sequential, or
   by rung on ladder pages). See [How numbering works](numbering.md).
8. **See the lists.** **Reports > Reports**: terminal diagrams, cable and wire lists, connector pin lists, the BOM,
   legends and more, all generated from the schematic and updated live.
9. **Check it.** The warnings banner appears as soon as the electrical rule check finds something (a loose wire, a
   duplicate designation, a cable too small for its breaker). Many findings have a one-click fix.
10. **Print the set.** **Export PDF** writes the whole drawing set, or one page, as a vector PDF at true scale.

Everything you do can be undone (**Ctrl+Z**), including imports, renumbering and the assistant's proposals.

## Working like in your CAD

The command line at the bottom takes the commands electrical CAD users know: `L`, `PL`, `REC`, `C`, `M`, `CO`, `RO`,
`MI`, `E`, `TR`, `EX`, `O`, `Z`, `ZE`, `U`, `PAN`, `LA`, `DI`, plus CablePilot's own (`INSERT`, `WIRE`, `NUMBER`,
`REPORT`, `CHECK`, `SIZE`, `ERP`, `LADDER`, `AUTOWIRE`, `HISTORY`). **Enter** or **Space** repeats the last command,
**Esc** cancels. Points can be typed: `30,40` (absolute), `@60,0` (relative), `@50<90` (relative polar).
The status bar switches the drafting aids: grid **F7**, ortho **F8**, snap **F9**, object snap **F3**, polar
tracking **F10**. Press **F1** for the full list of keys.

## Your files

A project is one file, `name.cablepilot.json`: open, documented JSON that diffs well in Git
([file format](file-format.md)). CablePilot autosaves while you work and offers to recover after a crash; **History**
keeps a daily backup and the versions you name, and restores one as a single undo step.

## Optional: the assistant

The AI assistant uses your own API key (Claude, OpenAI or Gemini), stored encrypted by your operating system. Open
**AI settings** in the chat panel, paste the key and press **Test key**. The assistant proposes changes as a preview
that you accept or reject; every claim shows its source, and electrical values are labelled as suggestions to
confirm. Without a key, the app works fully.

## Where to go next

- [How numbering works](numbering.md): designations, wire numbers and terminals.
- [Project file format](file-format.md): what is in the file and how versions are migrated.
- [ERP link](erp-link.md) and [layout exchange format](layout-format.md): sharing data with your ERP.
- Questions and ideas: [GitHub Discussions](https://github.com/mojeee/cablepilot/discussions).
