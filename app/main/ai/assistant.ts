// One assistant turn (rule 6, honest AI). The model reads the project through tools, answers in words, and changes
// things only through validated proposals that the user previews. Runs in the main process: at most MAX_TOOL_ROUNDS
// tool rounds, an overall time limit, cancellable. Never throws: failures come back as a plain-language AppError.

import { systemPrompt } from '@shared/ai/prompt';
import { contextText, runTool, TOOL_SPECS, type ToolEnv, type Work } from '@shared/ai/tools';
import type { AiAnswer, AiProgress, AiProviderId, AiRequest, Claim, Proposal } from '@shared/ai/types';
import { setLanguage, t } from '@shared/i18n';
import { newId as defaultId } from '@shared/ids';
import type { MacroDef } from '@shared/library/types';
import type { Library } from '@shared/library/types';
import { fail, ok, type Result } from '@shared/result';
import type { StockList } from '@shared/stock';
import { ProviderError, toAiError, type ChatMessage, type ChatProvider, type ToolResult } from './providers';

export const MAX_TOOL_ROUNDS = 10;
export const TURN_TIMEOUT_MS = 120_000;
export const MAX_HISTORY = 8;
export const MAX_CLAIMS = 14;
const MAX_TOKENS = 8_000;

export interface RunOptions {
  provider: ChatProvider;
  providerId: AiProviderId;
  model: string;
  lib: Library;
  macros: MacroDef[];
  stock: StockList | null;
  signal?: AbortSignal;
  onProgress?: (e: AiProgress) => void;
  timeoutMs?: number;
  maxToolRounds?: number;
  newId?: (prefix?: string) => string;
  /** The answers come from the scripted stand-in (CP_AI_FAKE=1). */
  scripted?: boolean;
}

/** The conversation for the model: the context first, then the recent turns, the newest user prompt last. */
export function buildMessages(req: AiRequest, context: string): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'user', content: [context] }];
  for (const h of (req.history ?? []).slice(-MAX_HISTORY)) {
    if (h.role === 'user') out.push({ role: 'user', content: [h.text.slice(0, 1000)] });
    else out.push({ role: 'assistant', text: h.text.slice(0, 1500), toolCalls: [] });
  }
  out.push({ role: 'user', content: [req.prompt] });
  return out;
}

const ELECTRICAL_TEXT = /\d\s?(A|mm²|mm2|kW|kVA|V|W|Ω|ohm)\b/;

export async function runAssistant(req: AiRequest, opts: RunOptions): Promise<Result<AiAnswer>> {
  setLanguage(req.lang);
  const timeoutMs = opts.timeoutMs ?? TURN_TIMEOUT_MS;
  const maxRounds = opts.maxToolRounds ?? MAX_TOOL_ROUNDS;
  const progress = (e: AiProgress) => { try { opts.onProgress?.(e); } catch { /* a closed window must not stop the turn */ } };
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const onAbort = () => ctrl.abort();
  if (opts.signal?.aborted) ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  const deadline = Date.now() + timeoutMs;

  const env: ToolEnv = { project: req.project, lib: opts.lib, macros: opts.macros, stock: opts.stock, pageId: req.pageId, selection: req.selection, lang: req.lang };
  const work: Work = { project: req.project, proposals: [], newId: opts.newId ?? defaultId };
  const messages = buildMessages(req, contextText(env));
  const system = systemPrompt(req.lang);
  const claims: Claim[] = [];
  const log: string[] = [];
  const texts: string[] = [];
  try {
    for (let round = 0; ; round++) {
      if (ctrl.signal.aborted) throw new ProviderError(timedOut ? 'timeout' : 'cancelled', opts.providerId, 'stopped');
      const res = await opts.provider.chat({ model: opts.model, system, messages, tools: TOOL_SPECS, maxTokens: MAX_TOKENS, cacheSystem: true, timeoutMs: Math.max(1000, deadline - Date.now()), signal: ctrl.signal });
      messages.push({ role: 'assistant', text: res.text, toolCalls: res.toolCalls, raw: res.raw });
      if (res.text.trim()) { texts.push(res.text.trim()); progress({ kind: 'text', text: res.text.trim() }); }
      if (res.stop === 'refusal' && !res.toolCalls.length && !texts.length && !work.proposals.length) throw new ProviderError('refused', opts.providerId, 'refused');
      if (!res.toolCalls.length) {
        if (res.stop === 'max_tokens') texts.push(t('(The answer was cut short because it was too long.)'));
        break;
      }
      if (round >= maxRounds) { texts.push(t('I stopped after {n} steps without finishing. Ask again with a narrower request.', { n: maxRounds })); break; }
      const results: ToolResult[] = [];
      for (const c of res.toolCalls) {
        const out = runTool(c.name, c.input, env, work);
        results.push({ callId: c.id, name: c.name, content: out.content, isError: out.isError });
        log.push(out.summary);
        for (const cl of out.claims ?? []) if (!claims.some((x) => x.text === cl.text)) claims.push(cl);
        progress({ kind: 'tool', summary: out.summary });
      }
      messages.push({ role: 'tool', results });
    }
    const text = texts.join('\n\n') || (work.proposals.length ? t('I prepared a proposal. It is a preview: accept it or reject it.') : t('I have no answer to that. Try asking about the project, the checks, a feeder or the layout.'));
    // Merge the reply's proposals: one preview, one undo step.
    const proposal: Proposal | undefined = work.proposals.length
      ? work.proposals.length === 1 ? work.proposals[0] : { label: work.proposals.map((p) => p.label.replace(/^AI: /, '')).join(', ').replace(/^/, 'AI: ').slice(0, 80), commands: work.proposals.flatMap((p) => p.commands), summary: work.proposals.flatMap((p) => p.summary), ...(work.proposals[0].page ? { page: work.proposals[0].page } : {}) }
      : undefined;
    // Rule 6: electrical values the model wrote itself are suggestions; say so when nothing sourced them.
    if ((proposal || ELECTRICAL_TEXT.test(text)) && !claims.some((c) => c.source.kind === 'suggestion')) claims.push({ text: t('Values and statements written by the assistant are suggestions.'), source: { kind: 'suggestion', ref: t('confirm before use') } });
    return ok({ text, claims: claims.slice(0, MAX_CLAIMS), ...(proposal ? { proposal } : {}), provider: { id: opts.providerId, fake: opts.scripted === true }, toolLog: log, model: { provider: opts.providerId, model: opts.model } });
  } catch (e) {
    let err = e;
    if (ctrl.signal.aborted && !(e instanceof ProviderError && (e.kind === 'timeout' || e.kind === 'cancelled'))) err = new ProviderError(timedOut ? 'timeout' : 'cancelled', opts.providerId, 'stopped');
    else if (e instanceof ProviderError && e.kind === 'cancelled' && timedOut) err = new ProviderError('timeout', opts.providerId, 'time limit');
    const ae = toAiError(err, opts.providerId, opts.model);
    return fail(ae.code, ae.message, ae.hint);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
    progress({ kind: 'done' });
  }
}
