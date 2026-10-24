// Read-only helpers on the project model.
import type { El, Page, Project, Template } from './types';

export const pageById = (p: Project, id: string): Page | undefined => p.pages.find((x) => x.id === id);
export const pageIndex = (p: Project, id: string): number => p.pages.findIndex((x) => x.id === id);
export const elementById = (page: Page, id: string): El | undefined => page.elements.find((e) => e.id === id);

/** The template of a page: its own, else the project's default, else the first one. */
export function templateOf(p: Project, page: Page): Template {
  const t = p.templates.find((x) => x.id === (page.templateId || p.settings.defaultTemplateId)) ?? p.templates[0];
  if (!t) throw new Error('project has no template');
  return t;
}
