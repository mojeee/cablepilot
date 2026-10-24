// Tiny i18n: the English text is the key. t('Page navigator') returns the Italian text when the
// language is Italian and a translation exists, else the English text.
// Placeholders: t('{n} pages', { n: 3 }). tests/i18n.test.ts checks that every t() literal has an
// Italian entry with the same placeholders.

import app from './it/app';
import devices from './it/devices';
import editor from './it/editor';

export type Lang = 'en' | 'it';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'it', label: 'Italiano' },
];

export const IT: Record<string, string> = { ...app, ...editor, ...devices };

let current: Lang = 'en';
const listeners = new Set<(l: Lang) => void>();

export function setLanguage(l: Lang): void {
  current = l === 'it' ? 'it' : 'en';
  for (const fn of listeners) fn(current);
}
export const getLanguage = (): Lang => current;
export function onLanguage(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function t(text: string, vars?: Record<string, string | number>): string {
  let s = current === 'it' ? (IT[text] ?? text) : text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}
