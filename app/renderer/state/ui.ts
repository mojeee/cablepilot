// UI state (Zustand). The project itself arrives in M1 as pure data in /shared with a command layer;
// until then the navigator shows sample pages so the layout can be seen and tested.

import { create } from 'zustand';
import { setLanguage, type Lang } from '@shared/i18n';
import type { CanvasTheme, Settings, Theme } from '@shared/settings';
import { DEFAULT_SETTINGS } from '@shared/settings';
import type { PageType, SheetSize } from '@shared/sheets';

export interface SamplePage {
  id: string;
  type: PageType;
  number: number;
}
export interface Message {
  id: number;
  severity: 'info' | 'warning' | 'error';
  /** Called at render time, so the message follows the language (it calls the translation function). */
  text: () => string;
}

interface UiState extends Settings {
  pages: SamplePage[];
  selectedPage: string;
  sheetSize: SheetSize;
  messages: Message[];
  setTheme(theme: Theme): void;
  setCanvas(canvas: CanvasTheme): void;
  setLang(language: Lang): void;
  selectPage(id: string): void;
  addMessage(severity: Message['severity'], text: () => string): void;
  hydrate(settings: Settings): void;
}

const SAMPLE_PAGES: SamplePage[] = (['cover', 'contents', 'power', 'control', 'plc', 'terminals', 'cables', 'layout'] as const).map((type, i) => ({
  id: `p${i + 1}`,
  type,
  number: i + 1,
}));

let nextMessage = 1;

/** Applies the theme to <html> and saves the setting through the typed API (when present). */
function persist(patch: Partial<Settings>): void {
  const root = document.documentElement;
  if (patch.theme) root.dataset.theme = patch.theme;
  if (patch.canvas) root.dataset.canvas = patch.canvas;
  if (patch.language) {
    setLanguage(patch.language);
    root.lang = patch.language;
  }
  void window.cablepilot?.settings.set(patch);
}

export const useUi = create<UiState>((set) => ({
  ...DEFAULT_SETTINGS,
  pages: SAMPLE_PAGES,
  selectedPage: 'p3',
  sheetSize: 'A3',
  messages: [],
  setTheme: (theme) => {
    persist({ theme });
    set({ theme });
  },
  setCanvas: (canvas) => {
    persist({ canvas });
    set({ canvas });
  },
  setLang: (language) => {
    persist({ language });
    set({ language });
  },
  selectPage: (selectedPage) => set({ selectedPage }),
  addMessage: (severity, text) => set((s) => ({ messages: [...s.messages, { id: nextMessage++, severity, text }] })),
  hydrate: (settings) => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.canvas = settings.canvas;
    root.lang = settings.language;
    setLanguage(settings.language);
    set(settings);
  },
}));
