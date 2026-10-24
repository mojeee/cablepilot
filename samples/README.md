# Samples

Sample projects shipped with the app (demo mode, product rule 10). The app lists them under "Sample
projects" and opens them as unsaved copies.

- `conveyor.cablepilot.json`: conveyor with a direct-on-line starter, an emergency-stop circuit and a small
  PLC (single-line, power, 24 V control and PLC pages, project data, cover and contents) and a suggested cabinet layout (front, door and side views). The PLC page is a rack:
  CPU, an 8-channel input card and an 8-channel output card with addresses and tags, and a PLC I/O list page.
- `pump-station.cablepilot.json`: pump station with two pumps, single-line, power, level control and PLC
  pages. It ships with a suggested cabinet layout (front and side views).
- `dc-charger.cablepilot.json`: 110 V DC battery-charger panel with Italian drawing texts: two data pages,
  single-line with dashed module outlines and a warning sign, input and rectifier modules, alarm relays and
  a PLC interface with input cards and a PLC I/O list page. It ships with a suggested cabinet layout: front view, door page with the door devices and side view.
- `stock-sample.csv`: a generic stock list (fictional quantities, generic part codes, two warehouses, a part with no
  technical data) for the Warehouse window's "Use the sample stock list"; the conveyor and pump samples carry load data
  so sizing works against it.

The project files are generated from `tests/support/samples.ts` with the same commands the editor uses. To change a
sample, edit that file and run `UPDATE_SAMPLES=1 npx vitest run tests/samples.test.ts`; the test fails when
the committed files are out of date. Generic parts and invented example data only; nothing is taken from a
third-party drawing.
