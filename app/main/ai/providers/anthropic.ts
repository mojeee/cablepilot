// Anthropic Claude through the Messages API with the built-in fetch (no SDK dependency, like OpenAI and Gemini).
// Docs: https://docs.anthropic.com/en/api/messages and the tool-use guide. The system prompt and the tool list are
// marked for prompt caching (they are frozen per language), and the tool loop replays the model's own content blocks
// unchanged (thinking blocks included). Adapted from the owner's MechPilot (Apache-2.0).

import { httpJson } from './http';
import { parseArgs, type ChatMessage, type ChatProvider, type ChatRequest, type ChatResponse, type StopReason, type ToolSpec } from './types';

export const API_URL = 'https://api.anthropic.com/v1';
export const ANTHROPIC_VERSION = '2023-06-01';

export type TextBlock = { type: 'text'; text: string };
export type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
export type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean };
export type BlockParam = TextBlock | ToolUseBlock | ToolResultBlock | { type: string; [k: string]: unknown };
export interface MessageParam {
  role: 'user' | 'assistant';
  content: BlockParam[];
}

/** Neutral messages to Anthropic messages. Consecutive user-side turns are merged. */
export function toAnthropicMessages(messages: ChatMessage[]): MessageParam[] {
  const out: MessageParam[] = [];
  const pushUser = (blocks: BlockParam[]) => {
    const last = out[out.length - 1];
    if (last && last.role === 'user') last.content.push(...blocks);
    else out.push({ role: 'user', content: blocks });
  };
  for (const m of messages) {
    if (m.role === 'user') pushUser(m.content.map((text): BlockParam => ({ type: 'text', text })));
    else if (m.role === 'tool') pushUser(m.results.map((r): BlockParam => ({ type: 'tool_result', tool_use_id: r.callId, content: r.content, is_error: r.isError })));
    else if (m.raw?.provider === 'anthropic' && Array.isArray(m.raw.data)) out.push({ role: 'assistant', content: m.raw.data as BlockParam[] });
    else {
      const blocks: BlockParam[] = [];
      if (m.text) blocks.push({ type: 'text', text: m.text });
      for (const c of m.toolCalls) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
      out.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '…' }] });
    }
  }
  return out;
}

/** Tools; the last one carries the cache breakpoint so tools and system are cached together. */
export function toAnthropicTools(tools: ToolSpec[], cache = false): Record<string, unknown>[] {
  return tools.map((t, i) => ({ name: t.name, description: t.description, input_schema: t.parameters, ...(cache && i === tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}) }));
}

/** The request body (pure, tested with recorded shapes). */
export function anthropicBody(req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens,
    messages: toAnthropicMessages(req.messages),
    system: [{ type: 'text', text: req.system, ...(req.cacheSystem ? { cache_control: { type: 'ephemeral' } } : {}) }],
  };
  if (req.tools.length) body.tools = toAnthropicTools(req.tools, req.cacheSystem);
  return body;
}

export interface AnthropicResponse {
  content?: BlockParam[];
  stop_reason?: string | null;
}

export function parseAnthropicResponse(msg: AnthropicResponse): ChatResponse {
  const content = msg.content ?? [];
  const text = content.map((b) => (b.type === 'text' ? String((b as TextBlock).text ?? '') : '')).join('');
  const toolCalls = content.flatMap((b) => (b.type === 'tool_use' ? [{ id: String((b as ToolUseBlock).id), name: String((b as ToolUseBlock).name), input: parseArgs((b as ToolUseBlock).input) }] : []));
  const stop: StopReason = msg.stop_reason === 'refusal' ? 'refusal' : msg.stop_reason === 'tool_use' || toolCalls.length ? 'tool_use' : msg.stop_reason === 'max_tokens' ? 'max_tokens' : 'end';
  return { text, toolCalls, stop, raw: { provider: 'anthropic', data: content } };
}

export class AnthropicProvider implements ChatProvider {
  readonly id = 'anthropic' as const;
  constructor(private readonly apiKey: string) {}

  private headers() {
    return { 'x-api-key': this.apiKey, 'anthropic-version': ANTHROPIC_VERSION };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await httpJson<AnthropicResponse>('anthropic', `${API_URL}/messages`, { headers: this.headers(), body: anthropicBody(req), timeoutMs: req.timeoutMs, signal: req.signal, key: this.apiKey });
    return parseAnthropicResponse(res);
  }

  /** The Models API: proves the key and the model id without spending tokens. */
  async check(model: string, timeoutMs = 20_000): Promise<void> {
    await httpJson('anthropic', `${API_URL}/models/${encodeURIComponent(model)}`, { headers: this.headers(), timeoutMs, key: this.apiKey });
  }
}
