// The lists of a project as sheets of a workbook or as CSV: BOM, wire list, terminal diagram,
// cable list, connector pin lists, marker lists, nameplates, torque table. Same tables as the
// report pages (shared/reports.ts), so a list and its page never disagree.

import type { Library } from '../library/types';
import type { Project, ReportId } from '../model/types';
import { REPORT_IDS } from '../model/types';
import { reportTable, tableMatrix } from '../reports';
import { xlsxBytes, type Sheet } from './xlsx';
import { toCsv } from './csv';

export const workbookSheets = (project: Project, lib: Library, ids: readonly ReportId[] = REPORT_IDS): Sheet[] =>
  ids.map((id) => {
    const t = reportTable(project, lib, id);
    return { name: t.title, rows: tableMatrix(t) };
  });

export const workbookBytes = (project: Project, lib: Library): Uint8Array => xlsxBytes(workbookSheets(project, lib));

export const reportCsv = (project: Project, lib: Library, id: ReportId): string => toCsv(tableMatrix(reportTable(project, lib, id)), project.settings.drawingLanguage);
