// User settings kept by the main process (a JSON file in the app's data folder). No secrets here:
// API keys are stored encrypted with Electron safeStorage (app/main/ai/keys.ts), never in this file.

import type { Lang } from './i18n';
import { isModelId, PROVIDER_IDS, type AiProviderId } from './ai/types';
import { DEFAULT_LAYOUT, parseLayout, type Layout } from './layout';

export type Theme = 'dark' | 'light';
export type CanvasTheme = 'dark' | 'white';

export interface Settings {
  theme: Theme;
  canvas: CanvasTheme;
  language: Lang;
  /** The docked panels (M6 part 2), saved per user. */
  layout: Layout;
  /** The assistant (M7): which provider and the model id chosen for each; no key. */
  ai: { provider: AiProviderId; models: Partial<Record<AiProviderId, string>> };
}

export const DEFAULT_SETTINGS: Settings = { theme: 'dark', canvas: 'dark', language: 'en', layout: DEFAULT_LAYOUT, ai: { provider: 'anthropic', models: {} } };

/** Reads untrusted JSON into valid settings: unknown or invalid fields fall back to the defaults. */
export function parseSettings(raw: unknown): Settings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    theme: o.theme === 'light' ? 'light' : 'dark',
    canvas: o.canvas === 'white' ? 'white' : 'dark',
    language: o.language === 'it' ? 'it' : 'en',
    layout: parseLayout(o.layout),
    ai: parseAi(o.ai),
  };
}

function parseAi(raw: unknown): Settings['ai'] {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const m = typeof o.models === 'object' && o.models !== null ? (o.models as Record<string, unknown>) : {};
  const models: Settings['ai']['models'] = {};
  for (const id of PROVIDER_IDS) if (isModelId(m[id])) models[id] = (m[id] as string).trim();
  return { provider: PROVIDER_IDS.includes(o.provider as AiProviderId) ? (o.provider as AiProviderId) : 'anthropic', models };
}
