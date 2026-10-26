// The AI chat (state): the conversation, the pending proposal and the context hint. The assistant runs
// in the main process (shared/api.ts `ai`); a proposal is previewed on the canvas and applied as one
// undo step on Accept, never silently (rule 6).

import { create } from 'zustand';
import { t, getLanguage } from '@shared/i18n';
import { apply, type Command } from '@shared/commands';
import type { AiAnswer, AiProviderId, AiStatus } from '@shared/ai/types';
import type { Project } from '@shared/model/types';
import { useEditor } from './editor';
import { withShown } from '@shared/layout';
import { useUi } from './ui';

export interface ChatMsg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  answer?: AiAnswer;
  /** For a message with a proposal: what became of it. */
  outcome?: 'pending' | 'accepted' | 'rejected' | 'stale';
}

export interface Pending {
  msg: number;
  answer: AiAnswer;
  /** The project the proposal was made for, and what applying it gives (shown on the canvas). */
  base: Project;
  preview: Project;
  /** Ids of the elements the proposal adds or changes: highlighted on the canvas. */
  highlight: string[];
  command: Command;
}

export interface Hint {
  text: string;
  prompt: string;
  coil?: { page: string; el: string };
}

interface ChatState {
  messages: ChatMsg[];
  busy: boolean;
  proposal: Pending | null;
  /** A context hint; `coil` names the coil it is about, so it goes away once that coil has a contact or is gone. */
  hint: Hint | null;
  status: AiStatus | null;
  /** What the assistant is doing now, one plain line per tool call (while busy). */
  progress: string[];
  setHint(h: Hint | null): void;
  loadStatus(): Promise<void>;
  /** Settings actions (the AI settings dialog); each returns an error message or null. */
  setSettings(patch: { provider?: AiProviderId; model?: string }): Promise<string | null>;
  setKey(provider: AiProviderId, key: string): Promise<string | null>;
  clearKey(provider: AiProviderId): Promise<string | null>;
  testKey(provider: AiProviderId): Promise<{ ok: boolean; text: string }>;
  cancel(): void;
  ask(prompt: string): Promise<void>;
  /** Shows an answer made here (a layout suggestion, an import preview) as the assistant would: text, sources and a proposal to accept or reject. */
  present(text: string, answer: AiAnswer): void;
  accept(): void;
  reject(): void;
}

let nextId = 1;

/** Elements added or changed between two projects (by identity, page by page). */
export function changedElementIds(a: Project, b: Project): string[] {
  const out: string[] = [];
  for (const pg of b.pages) {
    const before = new Map((a.pages.find((p) => p.id === pg.id)?.elements ?? []).map((e) => [e.id, e]));
    for (const e of pg.elements) if (before.get(e.id) !== e) out.push(e.id);
  }
  return out;
}

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  busy: false,
  proposal: null,
  hint: null,
  status: null,
  progress: [],
  setHint: (hint) => set({ hint }),
  loadStatus: async () => {
    const r = await window.cablepilot?.ai.status();
    if (r?.ok) set({ status: r.value });
  },
  setSettings: async (patch) => { const r = await window.cablepilot.ai.setSettings(patch); if (r.ok) set({ status: r.value }); return r.ok ? null : `${r.error.message} ${r.error.hint}`; },
  setKey: async (provider, key) => { const r = await window.cablepilot.ai.setKey(provider, key); if (r.ok) set({ status: r.value }); return r.ok ? null : `${r.error.message} ${r.error.hint}`; },
  clearKey: async (provider) => { const r = await window.cablepilot.ai.clearKey(provider); if (r.ok) set({ status: r.value }); return r.ok ? null : `${r.error.message} ${r.error.hint}`; },
  testKey: async (provider) => { const r = await window.cablepilot.ai.testKey(provider); return r.ok ? { ok: true, text: t('The key works with {model}.', { model: r.value.model }) } : { ok: false, text: `${r.error.message} ${r.error.hint}` }; },
  cancel: () => { void window.cablepilot.ai.cancel(); },
  ask: async (prompt) => {
    const text = prompt.trim();
    if (!text || get().busy) return;
    const ed = useEditor.getState();
    const prev = get().proposal;
    const history = get().messages.filter((m) => m.text).slice(-8).map((m) => ({ role: m.role, text: m.text }));
    set((s) => ({
      busy: true,
      progress: [],
      hint: null,
      proposal: null,
      messages: [...s.messages.map((m) => (prev && m.id === prev.msg ? { ...m, outcome: 'stale' as const } : m)), { id: nextId++, role: 'user', text }],
    }));
    const off = window.cablepilot.ai.onProgress((p) => { if (p.kind === 'tool') set((s) => ({ progress: [...s.progress, p.summary] })); });
    const r = await window.cablepilot.ai.ask({ prompt: text, lang: getLanguage(), history, project: ed.project(), pageId: ed.pageId, selection: ed.selection });
    off();
    if (!r.ok) {
      set((s) => ({ busy: false, progress: [], messages: [...s.messages, { id: nextId++, role: 'assistant', text: `${r.error.message} ${r.error.hint}` }] }));
      return;
    }
    const answer = r.value;
    const id = nextId++;
    if (answer.proposal) {
      const base = useEditor.getState().project();
      const command: Command = answer.proposal.commands.length === 1 ? answer.proposal.commands[0] : { type: 'batch', label: answer.proposal.label, commands: answer.proposal.commands };
      const preview = apply(base, command, { lib: useEditor.getState().lib });
      const highlight = changedElementIds(base, preview);
      if (answer.proposal.page) useEditor.getState().patch({ pageId: answer.proposal.page, selection: [] });
      set((s) => ({ busy: false, progress: [], proposal: { msg: id, answer, base, preview, highlight, command }, messages: [...s.messages, { id, role: 'assistant', text: answer.text, answer, outcome: 'pending' }] }));
    } else set((s) => ({ busy: false, progress: [], messages: [...s.messages, { id, role: 'assistant', text: answer.text, answer }] }));
  },
  present: (text, answer) => {
    const ed = useEditor.getState();
    const prev = get().proposal;
    const id = nextId++;
    if (!answer.proposal) {
      set((s) => ({ messages: [...s.messages, { id: nextId++, role: 'user', text }, { id, role: 'assistant', text: answer.text, answer }] }));
      return;
    }
    const base = ed.project();
    const command: Command = answer.proposal.commands.length === 1 ? answer.proposal.commands[0] : { type: 'batch', label: answer.proposal.label, commands: answer.proposal.commands };
    const preview = apply(base, command, { lib: ed.lib });
    const highlight = changedElementIds(base, preview);
    if (answer.proposal.page) ed.patch({ pageId: answer.proposal.page, selection: [] });
    set((s) => ({ proposal: { msg: id, answer, base, preview, highlight, command }, messages: [...s.messages.map((m) => (prev && m.id === prev.msg ? { ...m, outcome: 'stale' as const } : m)), { id: nextId++, role: 'user', text }, { id, role: 'assistant', text: answer.text, answer, outcome: 'pending' as const }] }));
    const ui = useUi.getState();
    ui.setLayout(withShown(ui.layout, 'chat'));
  },
  accept: () => {
    const p = get().proposal;
    if (!p) return;
    const ed = useEditor.getState();
    if (ed.project() !== p.base) {
      set((s) => ({ proposal: null, messages: s.messages.map((m) => (m.id === p.msg ? { ...m, outcome: 'stale' as const } : m)) }));
      useUi.getState().addMessage('warning', () => t('The drawing changed since the proposal was made. Ask again.'));
      return;
    }
    set({ proposal: null });
    ed.exec(p.command);
    ed.patch({ selection: p.highlight.filter((id) => ed.page()?.elements.some((e) => e.id === id)) });
    set((s) => ({ proposal: null, messages: s.messages.map((m) => (m.id === p.msg ? { ...m, outcome: 'accepted' as const } : m)) }));
    useUi.getState().addMessage('info', () => t('Applied the assistant\'s proposal as one undo step.'));
  },
  reject: () => {
    const p = get().proposal;
    if (!p) return;
    set((s) => ({ proposal: null, messages: s.messages.map((m) => (m.id === p.msg ? { ...m, outcome: 'rejected' as const } : m)) }));
  },
}));

/**
 * A proposal belongs to the project it was made for: any other edit makes it stale. Started once by the
 * app (not at import time: the editor and the chat import each other).
 */
export function watchProposals(): () => void {
  return useEditor.subscribe((s, prev) => {
    const p = useChat.getState().proposal;
    if (p && s.history.present !== prev.history.present && s.history.present !== p.preview) useChat.setState((c) => ({ proposal: null, messages: c.messages.map((m) => (m.id === p.msg ? { ...m, outcome: 'stale' as const } : m)) }));
  });
}
