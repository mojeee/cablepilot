# Demo: draw it once, the lists and the drawing set follow

A walkthrough of CablePilot with the DC battery-charger sample, about a minute and a half. It is the
same story as the video on the website, and everything in it works in the current version: no mock-ups.
The video is recorded from the real built app by a script (`e2e/demo.e2e.ts`), so it is made again
whenever the interface changes: `npm run record:demo`.

## 1. Open the sample and flick through the drawing set

Choose **Sample projects > Caricabatterie 110 V DC**. The project opens on its cover sheet. Click through the
pages in the navigator: contents, single-line diagram, multi-line power page, PLC interface, terminal
diagram, wire list and bill of materials. These are the pages of the set a workshop builds from and a
customer signs off, all in the project's own frame and title block.

- Sample projects ship with the app, so every feature can be shown without your own files.
- The pages are drawn in the project's drawing language (Italian here), whatever language the interface uses.

## 2. A coil and a contact from the library

On the alarm-relay page, type `coil` in the symbol search and place a coil. It gets its designation by
itself. Then place a normally open contact and give it the same designation: the contact joins the coil's
device, and the cross-references appear on both. Assign a generic part to the device in the Properties panel.

- The designation follows IEC 81346 (=function +location -product).
- Nothing is typed twice: the device, its two symbols and its part are one entry in every list.

## 3. Wire numbers, colours and a bundle

Open **Wires**, set the first number to 20 and click **Number wires now**: the wires are numbered with the
pattern `{n:3}{suffix}` (020L+, 021L+ and so on) in one undo step. Conductors are drawn in the colour of
their wire class (IEC 60757 abbreviations), and a wire marked as a bundle shows a single label with its
cross-section and colour instead of a number.

- The company wire-class table is editable in the same window.
- Wires on one net, and nets joined across pages, share one number. Numbers typed by hand stay.

## 4. Reports that follow the schematic

Open **Reports**: the terminal diagram, the wire list with the new numbers, and the bill of materials, which
already counts the contactor you just placed. All lists are generated from the schematic and update with it.

- The same lists can be added to the drawing set as pages.

## 5. Print preview, the PDF set and the XLSX lists

Switch on **Print preview (white)** to see the page as it prints. Then **Export PDF** writes the complete
drawing set (vector, text embedded), and **Export all lists as XLSX** writes every list as one workbook.
The video ends on the cover sheet.

- Files belong to you: an open project format, PDF and XLSX out, no account.
