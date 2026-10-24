# Samples

Sample projects shipped with the app (demo mode, product rule 10). The app lists them under "Sample
projects" and opens them as unsaved copies.

- `conveyor.cablepilot.json`: conveyor with a direct-on-line starter, an emergency-stop circuit and a small
  PLC (M1 version: single-line, power, 24 V control and PLC pages, project data, cover and contents).
- `pump-station.cablepilot.json`: pump station with two pumps, single-line, power, level control and PLC
  pages. The star-delta starter and the cabinet layout come with M2 and M6.
- `dc-charger.cablepilot.json`: 110 V DC battery-charger panel with Italian drawing texts: two data pages,
  single-line with dashed module outlines and a warning sign, input and rectifier modules, alarm relays and
  a PLC interface. Terminal, cable and layout pages are placeholders until M3 and M6.

The files are generated from `tests/support/samples.ts` with the same commands the editor uses. To change a
sample, edit that file and run `UPDATE_SAMPLES=1 npx vitest run tests/samples.test.ts`; the test fails when
the committed files are out of date. Generic parts and invented example data only; nothing is taken from a
third-party drawing.
