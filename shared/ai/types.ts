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

export interface AiRequest {
  prompt: string;
  lang: Lang;
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
  /** The request needs a real provider with an API key (M7). */
  needsKey?: boolean;
}

export interface AiStatus {
  provider: string;
  fake: boolean;
  keyConfigured: boolean;
}
