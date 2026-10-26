// IPC handlers of the assistant (the `ai` block of shared/api.ts). Arguments arrive as unknown and are checked;
// nothing throws across the bridge; a key never leaves the main process. Channels: ai:status, ai:setSettings,
// ai:setKey, ai:clearKey, ai:testKey, ai:ask, ai:cancel; while ai:ask runs, progress events go to the asking window
// on "ai:progress". Without a stored key the built-in assistant answers (the app is fully usable without AI).

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { PROVIDER_INFO, isModelId, type AiProgress, type AiProviderId, type AiRequest, type AiStatus } from '@shared/ai/types';
import { setLanguage, t } from '@shared/i18n';
import { fail, ok, type Result } from '@shared/result';
import type { SettingsStore } from '../settings';
import type { WarehouseService } from '../warehouse';
import { runAssistant } from './assistant';
import { builtInAnswer } from './builtin';
import { PROVIDERS, type KeyStore } from './keys';
import { MAIN_LIBRARY, MAIN_MACROS } from './library';
import { createProvider, ProviderError, toAiError, useFake } from './providers';

export const AI_PROGRESS_CHANNEL = 'ai:progress';
/** Requests to a provider per window of time: protects the user's API bill from a runaway loop. */
export const RATE_LIMIT = { max: 30, windowMs: 10 * 60_000 };
export const MAX_PROMPT = 2000;
/** The project sent for a request, in characters of JSON: a very large project is refused with a plain message. */
export const MAX_PROJECT_JSON = 12_000_000;

export interface AiIpcDeps {
  settings: SettingsStore;
  keys: KeyStore;
  warehouse: WarehouseService;
  /** Scripted stand-in instead of the real providers (CP_AI_FAKE=1). */
  fake?: boolean;
}

const isProvider = (v: unknown): v is AiProviderId => typeof v === 'string' && (PROVIDERS as string[]).includes(v);

/** A sliding-window limiter (pure; the clock is passed in so tests need no timers). */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(private readonly max = RATE_LIMIT.max, private readonly windowMs = RATE_LIMIT.windowMs) {}
  take(now: number): boolean {
    this.stamps = this.stamps.filter((s) => now - s < this.windowMs);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
}

export function aiStatus(deps: AiIpcDeps): AiStatus {
  const s = deps.settings.get().ai;
  const provider = s.provider;
  const model = s.models[provider] ?? PROVIDER_INFO[provider].defaultModel;
  const hasKey = deps.keys.hasKey();
  return { provider, model, hasKey, keySource: deps.keys.keySource(), active: hasKey[provider] ? provider : 'built-in', scripted: deps.fake ?? useFake() };
}

export function registerAiIpc(deps: AiIpcDeps): void {
  const fake = deps.fake ?? useFake();
  const running = new Map<number, AbortController>();
  const limiter = new RateLimiter();

  ipcMain.handle('ai:status', (): Result<AiStatus> => ok(aiStatus(deps)));

  ipcMain.handle('ai:setSettings', (_e, patch: unknown): Result<AiStatus> => {
    const cur = deps.settings.get().ai;
    const p = typeof patch === 'object' && patch !== null ? (patch as { provider?: unknown; model?: unknown }) : {};
    const provider = isProvider(p.provider) ? p.provider : cur.provider;
    const models = { ...cur.models };
    if (typeof p.model === 'string') {
      if (p.model.trim() === '') delete models[provider];
      else if (isModelId(p.model)) models[provider] = p.model.trim();
      else return fail('ai_model_id', t('That is not a valid model id.'), t('Use letters, digits and . _ - : / @ only.'));
    }
    deps.settings.set({ ai: { provider, models } });
    return ok(aiStatus(deps));
  });

  ipcMain.handle('ai:setKey', (_e, provider: unknown, key: unknown): Result<AiStatus> => {
    if (!isProvider(provider)) return fail('bad-request', t('Unknown AI provider.'), t('Pick Claude, OpenAI or Gemini.'));
    if (typeof key !== 'string') return fail('ai_key_empty', t('The key is empty.'), t('Paste the key from your provider account.'));
    const err = deps.keys.set(provider, key);
    return err ? { ok: false, error: err } : ok(aiStatus(deps));
  });

  ipcMain.handle('ai:clearKey', (_e, provider: unknown): Result<AiStatus> => {
    if (isProvider(provider)) deps.keys.clear(provider);
    return ok(aiStatus(deps));
  });

  ipcMain.handle('ai:testKey', async (_e, provider: unknown): Promise<Result<{ model: string }>> => {
    if (!isProvider(provider)) return fail('bad-request', t('Unknown AI provider.'), t('Pick Claude, OpenAI or Gemini.'));
    const s = deps.settings.get().ai;
    const model = s.models[provider] ?? PROVIDER_INFO[provider].defaultModel;
    const key = deps.keys.get(provider);
    if (!key) { const ae = toAiError(new ProviderError('no_key', provider, 'No key'), provider, model); return fail(ae.code, ae.message, ae.hint ?? ''); }
    try {
      await createProvider(provider, key, fake).check(model);
      return ok({ model });
    } catch (e) {
      const ae = toAiError(e, provider, model);
      return fail(ae.code, ae.message, ae.hint ?? '');
    }
  });

  ipcMain.handle('ai:ask', async (e: IpcMainInvokeEvent, raw: unknown) => {
    const r = raw as Partial<AiRequest> | null;
    if (!r || typeof r.prompt !== 'string' || !r.project || typeof r.pageId !== 'string' || !Array.isArray(r.selection)) return fail('ai.request', 'The request to the assistant is incomplete.', 'Report this on GitHub.');
    const lang = r.lang === 'it' ? 'it' : 'en';
    setLanguage(lang);
    const req: AiRequest = {
      prompt: r.prompt.slice(0, MAX_PROMPT), lang, project: r.project, pageId: r.pageId, selection: r.selection.filter((x): x is string => typeof x === 'string'),
      history: Array.isArray(r.history) ? r.history.filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string').slice(-8).map((h) => ({ role: h.role, text: h.text.slice(0, 1500) })) : [],
    };
    const st = aiStatus(deps);
    if (st.active === 'built-in') return builtInAnswer(req);
    const provider = st.active;
    const model = st.model;
    const key = deps.keys.get(provider);
    if (!key) { const ae = toAiError(new ProviderError('no_key', provider, 'No key'), provider, model); return fail(ae.code, ae.message, ae.hint ?? ''); }
    if (req.prompt.trim().length === 0) return fail('ai_empty', t('Write a question or a request for the assistant.'), t('For example: "why does the check say Q3 is too small?"'));
    const id = e.sender.id;
    if (running.has(id)) return fail('ai_busy', t('The assistant is still working on the previous request.'), t('Wait for it, or stop it first.'));
    if (!limiter.take(Date.now())) { const ae = toAiError(new ProviderError('limit', provider, 'rate limit'), provider, model); return fail(ae.code, ae.message, ae.hint ?? ''); }
    const ctrl = new AbortController();
    running.set(id, ctrl);
    const send = (p: AiProgress) => { if (!e.sender.isDestroyed()) e.sender.send(AI_PROGRESS_CHANNEL, p); };
    try {
      const wh = deps.warehouse.load();
      const res = await runAssistant(req, { provider: createProvider(provider, key, fake), providerId: provider, model, lib: MAIN_LIBRARY, macros: MAIN_MACROS, stock: wh.ok ? wh.value.stock : null, signal: ctrl.signal, onProgress: send, scripted: fake });
      return res;
    } finally {
      running.delete(id);
    }
  });

  ipcMain.handle('ai:cancel', (e: IpcMainInvokeEvent): Result<null> => {
    running.get(e.sender.id)?.abort();
    return ok(null);
  });
}
