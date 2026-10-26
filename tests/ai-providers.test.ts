// Request and response mapping of the three providers with recorded response shapes (tests/fixtures/ai/*.json,
// copied from the providers' documented answers): no network. Requests go through a recording fetch; errors become
// typed ProviderErrors in plain words and never contain the key.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANTHROPIC_VERSION, anthropicBody, AnthropicProvider, parseAnthropicResponse, toAnthropicMessages } from '../app/main/ai/providers/anthropic';
import { openAiBody, OpenAiProvider, parseOpenAiResponse, toOpenAiInput, type OpenAiResponse } from '../app/main/ai/providers/openai';
import { geminiBody, GeminiProvider, parseGeminiResponse, toGeminiContents, type GeminiResponse } from '../app/main/ai/providers/gemini';
import { httpError, httpJson, transport } from '../app/main/ai/providers/http';
import { createProvider, toAiError, useFake } from '../app/main/ai/providers';
import { ProviderError, scrub, type ChatMessage, type ChatRequest } from '../app/main/ai/providers/types';
import { TOOL_SPECS } from '@shared/ai/tools';
import { PROVIDER_INFO } from '@shared/ai/types';

const fx = <T>(name: string): T => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'ai', name), 'utf8')) as T;
const KEY = 'sk-ant-test-0123456789abcdef';

const messages: ChatMessage[] = [
  { role: 'user', content: ['Project "Pump": 22 pages'] },
  { role: 'user', content: ['renumber the wires on pages 3-8'] },
  { role: 'assistant', text: 'Reading.', toolCalls: [{ id: 't1', name: 'read_project', input: {} }] },
  { role: 'tool', results: [{ callId: 't1', name: 'read_project', content: '{"pageCount":22}', isError: false }] },
];
const req = (model: string): ChatRequest => ({ model, system: 'SYSTEM', messages, tools: TOOL_SPECS, maxTokens: 1000, cacheSystem: true });

type Sent = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null };
const original = transport.fetch;
afterEach(() => { transport.fetch = original; });
/** Replaces fetch with a recorder that answers with a fixture. */
function record(status: number, body: unknown): Sent[] {
  const sent: Sent[] = [];
  transport.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), method: init?.method ?? 'GET', headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return sent;
}

describe('anthropic mapping', () => {
  it('caches system and tools, merges user turns, maps tool results, and builds the Messages API request', async () => {
    const b = anthropicBody(req('claude-sonnet-5-5')) as { system: unknown; tools: Record<string, unknown>[]; messages: unknown[] };
    expect(b.system).toEqual([{ type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } }]);
    expect(b.tools[b.tools.length - 1]).toMatchObject({ name: TOOL_SPECS[TOOL_SPECS.length - 1].name, cache_control: { type: 'ephemeral' } });
    expect(b.tools[0]).not.toHaveProperty('cache_control');
    expect(b.tools[0]).toMatchObject({ name: 'read_project', input_schema: { type: 'object' } });
    expect(b.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Project "Pump": 22 pages' }, { type: 'text', text: 'renumber the wires on pages 3-8' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Reading.' }, { type: 'tool_use', id: 't1', name: 'read_project', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"pageCount":22}', is_error: false }] },
    ]);
    const sent = record(200, fx('anthropic-end.json'));
    const r = await new AnthropicProvider(KEY).chat(req('claude-sonnet-5-5'));
    expect(sent[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(sent[0].headers['x-api-key']).toBe(KEY);
    expect(sent[0].headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(sent[0].body).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 1000 });
    expect(r).toMatchObject({ stop: 'end', toolCalls: [] });
    expect(r.text).toMatch(/1\.5 mm²/);
  });
  it('parses a recorded tool-use answer and replays its own blocks unchanged (thinking included)', () => {
    const r = parseAnthropicResponse(fx('anthropic-tool-use.json'));
    expect(r.text).toBe('I will read page 5 first.');
    expect(r.toolCalls).toEqual([{ id: 'toolu_01A09q90qw90lq917835lq9', name: 'read_page', input: { page: 5 } }]);
    expect(r.stop).toBe('tool_use');
    const out = toAnthropicMessages([{ role: 'user', content: ['q'] }, { role: 'assistant', text: r.text, toolCalls: r.toolCalls, raw: r.raw }]);
    expect(out[1].content).toEqual((fx<{ content: unknown[] }>('anthropic-tool-use.json')).content);
    expect(parseAnthropicResponse({ content: [], stop_reason: 'refusal' }).stop).toBe('refusal');
    expect(parseAnthropicResponse({ content: [{ type: 'text', text: 'x' }], stop_reason: 'max_tokens' }).stop).toBe('max_tokens');
  });
  it('maps recorded errors to plain kinds without the key; check() reads the models endpoint', async () => {
    const e1 = httpError('anthropic', 401, fx('anthropic-error-401.json'), KEY);
    expect(e1.kind).toBe('auth');
    expect(httpError('anthropic', 400, fx('anthropic-error-credit.json')).kind).toBe('quota');
    expect(httpError('anthropic', 529, { error: { message: 'Overloaded' } }).kind).toBe('rate');
    expect(httpError('anthropic', 404, { error: { message: 'model: nope' } }).kind).toBe('model');
    const sent = record(200, { id: 'claude-sonnet-5-5' });
    await new AnthropicProvider(KEY).check('claude-sonnet-5-5');
    expect(sent[0]).toMatchObject({ method: 'GET', url: 'https://api.anthropic.com/v1/models/claude-sonnet-5-5' });
    record(401, fx('anthropic-error-401.json'));
    await expect(new AnthropicProvider(KEY).check('x')).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('openai mapping', () => {
  it('builds a Responses API body with function tools and no stored state', () => {
    const b = openAiBody(req('gpt-5.1'));
    expect(b).toMatchObject({ model: 'gpt-5.1', instructions: 'SYSTEM', store: false, max_output_tokens: 1000 });
    expect(b.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'Project "Pump": 22 pages' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'renumber the wires on pages 3-8' }] },
      { role: 'assistant', content: 'Reading.' },
      { type: 'function_call', call_id: 't1', name: 'read_project', arguments: '{}' },
      { type: 'function_call_output', call_id: 't1', output: '{"pageCount":22}' },
    ]);
    expect((b.tools as { type: string; name: string }[])[0]).toMatchObject({ type: 'function', name: 'read_project' });
  });
  it('parses recorded answers: function call with reasoning replay, message, refusal, incomplete', async () => {
    const r = parseOpenAiResponse(fx<OpenAiResponse>('openai-tool-call.json'));
    expect(r.toolCalls).toEqual([{ id: 'call_67ccd2be', name: 'propose_renumber', input: { what: 'wires', fromPage: 3, toPage: 8 } }]);
    expect(r.stop).toBe('tool_use');
    const replay = toOpenAiInput([{ role: 'assistant', text: '', toolCalls: r.toolCalls, raw: r.raw }]);
    expect(replay[0]).toMatchObject({ type: 'reasoning', encrypted_content: 'gAAAA' });
    expect(replay[1]).toMatchObject({ type: 'function_call', call_id: 'call_67ccd2be' });
    expect(parseOpenAiResponse(fx<OpenAiResponse>('openai-message.json'))).toMatchObject({ text: 'Done: that is a suggestion, please confirm.', stop: 'end' });
    expect(parseOpenAiResponse(fx<OpenAiResponse>('openai-refusal.json')).stop).toBe('refusal');
    expect(parseOpenAiResponse({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }).stop).toBe('max_tokens');
    const sent = record(200, fx('openai-message.json'));
    await new OpenAiProvider('sk-test-key-0123456789abcdef').chat(req('gpt-5.1'));
    expect(sent[0].url).toBe('https://api.openai.com/v1/responses');
    expect(sent[0].headers.Authorization).toBe('Bearer sk-test-key-0123456789abcdef');
  });
  it('maps recorded errors', () => {
    expect(httpError('openai', 401, fx('openai-error-401.json')).kind).toBe('auth');
    expect(httpError('openai', 429, fx('openai-error-quota.json')).kind).toBe('quota');
    expect(httpError('openai', 429, { error: { message: 'Rate limit reached' } }).kind).toBe('rate');
    expect(httpError('openai', 404, { error: { message: 'The model `x` does not exist', code: 'model_not_found' } }).kind).toBe('model');
    expect(httpError('openai', 500, null).kind).toBe('server');
  });
});

describe('gemini mapping', () => {
  it('builds a generateContent body with function declarations and the key in a header, not the URL', async () => {
    const b = geminiBody(req('gemini-3.1-pro'));
    expect(b.systemInstruction).toEqual({ parts: [{ text: 'SYSTEM' }] });
    const contents = b.contents as { role: string; parts: unknown[] }[];
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(contents[2].parts).toEqual([{ functionResponse: { id: 't1', name: 'read_project', response: { output: { pageCount: 22 } } } }]);
    const decl = (b.tools as { functionDeclarations: { name: string; parametersJsonSchema: Record<string, unknown> }[] }[])[0].functionDeclarations;
    expect(decl.map((d) => d.name)).toEqual(TOOL_SPECS.map((t) => t.name));
    expect(JSON.stringify(decl)).not.toContain('additionalProperties');
    const sent = record(200, fx('gemini-text.json'));
    const r = await new GeminiProvider('AIzaSyTESTKEY0123456789abcdef').chat(req('gemini-3.1-pro'));
    expect(sent[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro:generateContent');
    expect(sent[0].url).not.toContain('AIza');
    expect(sent[0].headers['x-goog-api-key']).toBe('AIzaSyTESTKEY0123456789abcdef');
    expect(r.text).toBe('Q3 is a 16 A breaker.');
  });
  it('parses recorded answers, keeps thought signatures, never sends a made-up call id back, and reads blocks as refusals', () => {
    const r = parseGeminiResponse(fx<GeminiResponse>('gemini-function-call.json'));
    expect(r.toolCalls).toEqual([{ id: 'local-0', name: 'run_checks', input: { query: 'Q3' } }]);
    expect(r.text).toBe('Looking at the checks.');
    const back = toGeminiContents([{ role: 'assistant', text: r.text, toolCalls: r.toolCalls, raw: r.raw }, { role: 'tool', results: [{ callId: 'local-0', name: 'run_checks', content: '{"matching":1}', isError: false }] }]);
    expect(back[0].parts[0]).toMatchObject({ text: 'Looking at the checks.', thoughtSignature: 'CiQB' });
    expect(back[1].parts[0].functionResponse).toEqual({ name: 'run_checks', response: { output: { matching: 1 } } });
    expect(parseGeminiResponse(fx<GeminiResponse>('gemini-blocked.json')).stop).toBe('refusal');
  });
  it('maps recorded errors', () => {
    expect(httpError('gemini', 400, fx('gemini-error-key.json')).kind).toBe('auth');
    expect(httpError('gemini', 429, { error: { message: 'Quota', status: 'RESOURCE_EXHAUSTED' } }).kind).toBe('rate');
    expect(httpError('gemini', 404, { error: { message: 'models/x is not found for API version v1beta', status: 'NOT_FOUND' } }).kind).toBe('model');
  });
});

describe('transport, errors and the factory', () => {
  it('times out, cancels, and reports being offline in plain kinds', async () => {
    transport.fetch = ((_u: unknown, init?: RequestInit) => new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as typeof fetch;
    await expect(httpJson('openai', 'https://x.test', { headers: {}, body: {}, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' });
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10);
    await expect(httpJson('openai', 'https://x.test', { headers: {}, body: {}, signal: ctrl.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    transport.fetch = (async () => { throw new TypeError(`fetch failed for ${KEY}`); }) as typeof fetch;
    const e = await httpJson('anthropic', 'https://x.test', { headers: {}, key: KEY }).catch((x: ProviderError) => x);
    expect(e).toMatchObject({ kind: 'offline' });
    expect((e as Error).message).not.toContain(KEY);
  });
  it('scrubs keys from messages', () => {
    expect(scrub(`bad ${KEY} and sk-proj-abcdefghijklmnopqrstu and AIzaSyABCDEFGHIJKLMNOPQRSTUV`)).toBe('bad [key] and [key] and [key]');
  });
  it('turns every error kind into words and a hint, in both languages, with no key', () => {
    for (const kind of ['auth', 'quota', 'rate', 'offline', 'timeout', 'model', 'server', 'bad_request', 'refused', 'cancelled', 'no_key', 'limit'] as const) {
      const ae = toAiError(new ProviderError(kind, 'gemini', `x ${KEY}`, 500), 'gemini', 'gemini-3.1-pro');
      expect(ae.message.length).toBeGreaterThan(8);
      expect(ae.hint.length).toBeGreaterThan(4);
      expect(ae.message).not.toContain(KEY);
    }
    expect(toAiError(new Error('boom'), 'openai', 'm').code).toBe('ai_error');
  });
  it('creates the right provider, the scripted one in test mode, and knows the brief\'s default models', async () => {
    expect(createProvider('anthropic', 'k', false)).toBeInstanceOf(AnthropicProvider);
    expect(createProvider('openai', 'k', false)).toBeInstanceOf(OpenAiProvider);
    expect(createProvider('gemini', 'k', false)).toBeInstanceOf(GeminiProvider);
    await expect(createProvider('anthropic', 'k', true).check('anything')).resolves.toBeUndefined();
    expect(useFake({ CP_AI_FAKE: '1' })).toBe(true);
    expect(useFake({ CP_AI_FAKE: '0' })).toBe(false);
    expect(useFake({})).toBe(false);
    expect(PROVIDER_INFO.anthropic).toMatchObject({ defaultModel: 'claude-sonnet-5-5', fastModel: 'claude-haiku-4-5-20251001' });
  });
});
