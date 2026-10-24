// User settings kept by the main process (a JSON file in the app's data folder). No secrets here:
// API keys arrive with the AI milestone (M7) and are stored encrypted with Electron safeStorage.

import type { Lang } from './i18n';
import { DEFAULT_LAYOUT, parseLayout, type Layout } from './layout';

export type Theme = 'dark' | 'light';
export type CanvasTheme = 'dark' | 'white';

export interface Settings {
  theme: Theme;
  canvas: CanvasTheme;
  language: Lang;
  /** The docked panels (M6 part 2), saved per user. */
  layout: Layout;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'dark', canvas: 'dark', language: 'en', layout: DEFAULT_LAYOUT };

/** Reads untrusted JSON into valid settings: unknown or invalid fields fall back to the defaults. */
export function parseSettings(raw: unknown): Settings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    theme: o.theme === 'light' ? 'light' : 'dark',
    canvas: o.canvas === 'white' ? 'white' : 'dark',
    language: o.language === 'it' ? 'it' : 'en',
    layout: parseLayout(o.layout),
  };
}
