// Title block fields: values fill in from project and page properties (rule 1: typed once).
import { dt, pick, type DrawingTextKey } from './drawingText';
import type { Page, Project } from './model/types';
import { pageRevision } from './revisions';

export const TITLE_KEYS = ['logo', 'client', 'product', 'sheetTitle', 'drawingNo', 'orderNo', 'issueDate', 'revision', 'drawn', 'checked', 'approved', 'sheet', 'nextSheet', 'totalSheets'] as const;

export const pageNumber = (n: number): string => String(n).padStart(2, '0');

export function titleValue(key: string, project: Project, page: Page, index: number): string {
  const lang = project.settings.drawingLanguage;
  const total = project.pages.length;
  switch (key) {
    case 'sheetTitle': return pick(page.title, lang);
    case 'sheet': return pageNumber(index + 1);
    case 'nextSheet': return index + 1 < total ? pageNumber(index + 2) : '-';
    case 'totalSheets': return pageNumber(total);
    // The revision index of the sheet: the last issued revision in which it changed (M4).
    case 'revision': return pageRevision(project, page.id) ?? project.properties.revision ?? '';
    case 'logo': return '';
    default: return project.properties[key] ?? '';
  }
}

export function titleLabel(key: string, lang: 'en' | 'it'): string {
  return key in { logo: 1 } ? '' : dt(lang, key as DrawingTextKey);
}
