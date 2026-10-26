// The assistant's contract (rule 6, honest AI). A provider turns a request (the prompt with the project,
// the page and the selection as context) into an answer: text, claims that each name their source, and
// optionally a proposal, a list of commands the user accepts or rejects. A proposal is never applied by
// the provider: the renderer previews it on the canvas and applies it as one undo step on Accept.
// Providers run in the main process only (app/main/ai); the renderer never sees an API key.

import type { Command } from '../commands';
import type { Lang } from '../i18n';
import type { Project } from '../model/types';

/** Where a claim comes from: read from this project, a standard and clause, a library entry, or our own suggestion. */
export type SourceKind = 'project' | 'standard' | 'library' | 'suggestion';
export interface Source {
  kind: SourceKind;
  ref: string;
}
export interface Claim {
  text: string;
  source: Source;
}

export interface Proposal {
  /** The undo label of the whole proposal. */
  label: string;
  commands: Command[];
  /** One plain line per change, for the list beside the preview. */
  summary: string[];
  /** The page the changes are on (the canvas shows it). */
  page?: string;
}

export type AiProviderId = 'anthropic' | 'openai' | 'gemini';
export interface ProviderInfo {
  name: string;
  /** The model used when the user has not chosen one. */
  defaultModel: string;
  /** A cheaper, faster model offered in the settings. */
  fastModel: string;
  keyHelp: string;
}
/** Product decision (docs/brief.md, "Decisions already made"): Claude by default, with the fast model offered; model ids are settings, so a new model needs no release. */
export const PROVIDER_INFO: Record<AiProviderId, ProviderInfo> = {
  anthropic: { name: 'Claude', defaultModel: 'claude-sonnet-5-5', fastModel: 'claude-haiku-4-5-20251001', keyHelp: 'https://console.anthropic.com/settings/keys' },
  openai: { name: 'OpenAI', defaultModel: 'gpt-5.1', fastModel: 'gpt-5.1-mini', keyHelp: 'https://platform.openai.com/api-keys' },
  gemini: { name: 'Gemini', defaultModel: 'gemini-3.1-pro', fastModel: 'gemini-3.1-flash', keyHelp: 'https://aistudio.google.com/apikey' },
};
export const PROVIDER_IDS: AiProviderId[] = ['anthropic', 'openai', 'gemini'];
export const isModelId = (v: unknown): v is string => typeof v === 'string' && /^[\w.:/@-]{1,100}$/.test(v.trim());

/** What the renderer may know about the assistant's configuration. Never a key. */
export interface AiSettings {
  provider: AiProviderId;
  model: string;
  /** Whether a key is stored (or comes from the development environment) per provider. */
  hasKey: Record<AiProviderId, boolean>;
  keySource: Partial<Record<AiProviderId, 'stored' | 'env'>>;
}

/** Earlier turns of the conversation, as plain text (the proposals themselves are not replayed). */
export interface AiTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AiRequest {
  prompt: string;
  lang: Lang;
  /** The last turns of the chat, oldest first. */
  history?: AiTurn[];
  /** Context: the whole project, the page the user looks at and the selected elements. */
  project: Project;
  pageId: string;
  selection: string[];
}

export interface AiAnswer {
  text: string;
  claims: Claim[];
  proposal?: Proposal;
  /** Prompts the provider can answer (shown when it could not understand the request). */
  examples?: string[];
  /** Which provider answered; `fake` providers are deterministic stand-ins that say so. */
  provider: { id: string; fake: boolean };
  /** The request needs a provider with an API key. */
  needsKey?: boolean;
  /** What the assistant looked at and did, one plain line each (tool calls). */
  toolLog?: string[];
  /** The model that answered (absent for the built-in assistant). */
  model?: { provider: AiProviderId; model: string };
}

/** Progress of a running request, sent to the asking window. */
export type AiProgress = { kind: 'tool'; summary: string } | { kind: 'text'; text: string } | { kind: 'done' };

export interface AiStatus extends AiSettings {
  /** Who answers now: the built-in assistant (no key), or the chosen provider. */
  active: 'built-in' | AiProviderId;
  /** The answers come from a scripted stand-in (CP_AI_FAKE=1: tests and the demo), not from a model. */
  scripted: boolean;
}
