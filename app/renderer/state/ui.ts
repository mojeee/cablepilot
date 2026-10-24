// UI preferences (Zustand): theme, canvas colour, UI language and the message list. The project
// and the editor are in state/editor.ts.

import { create } from 'zustand';
import { setLanguage, type Lang } from '@shared/i18n';
import type { CanvasTheme, Settings, Theme } from '@shared/settings';
import { DEFAULT_SETTINGS } from '@shared/settings';
import { DEFAULT_LAYOUT, type Layout } from '@shared/layout';

export interface Message {
  id: number;
  severity: 'info' | 'warning' | 'error';
  /** Called at render time, so the message follows the language (it calls the translation function). */
  text: () => string;
}

interface UiState extends Settings {
  messages: Message[];
  /** Whether the findings of the electrical rule check show in the message list. */
  checksOpen: boolean;
  setChecksOpen(open: boolean): void;
  setTheme(theme: Theme): void;
  setCanvas(canvas: CanvasTheme): void;
  setLang(language: Lang): void;
  /** Changes the panel layout and saves it per user (settings in the main process). */
  setLayout(layout: Layout, save?: boolean): void;
  resetLayout(): void;
  /** Full-screen canvas: docks and ribbon hidden for this session. */
  fullscreen: boolean;
  setFullscreen(on: boolean): void;
  addMessage(severity: Message['severity'], text: () => string): void;
  hydrate(settings: Settings): void;
}

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
  messages: [],
  fullscreen: false,
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setLayout: (layout, save = true) => {
    if (save) persist({ layout });
    set({ layout });
  },
  resetLayout: () => {
    persist({ layout: DEFAULT_LAYOUT });
    set({ layout: DEFAULT_LAYOUT });
  },
  checksOpen: true,
  setChecksOpen: (checksOpen) => set({ checksOpen }),
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
  addMessage: (severity, text) => set((s) => ({ messages: [...s.messages.slice(-199), { id: nextMessage++, severity, text }] })),
  hydrate: (settings) => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.canvas = settings.canvas;
    root.lang = settings.language;
    setLanguage(settings.language);
    set(settings);
  },
}));
