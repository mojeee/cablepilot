// Undo and redo. Commands produce a new immutable project that shares structure with the old one,
// so a history entry is just the previous project: cheap even for 500-page projects.
import type { Project } from '../model/types';
import { apply, type Command, type Ctx } from './index';

export interface Entry {
  label: string;
  project: Project;
}
export interface History {
  present: Project;
  past: Entry[];
  future: Entry[];
}

export const MAX_UNDO = 300;

export const createHistory = (project: Project): History => ({ present: project, past: [], future: [] });

export function commandLabel(cmd: Command): string {
  return cmd.type === 'batch' ? cmd.label : cmd.type;
}

/** Runs a command. A command that changes nothing leaves the history as it is. */
export function exec(h: History, cmd: Command, ctx: Ctx): History {
  const next = apply(h.present, cmd, ctx);
  if (next === h.present) return h;
  const past = [...h.past, { label: commandLabel(cmd), project: h.present }];
  if (past.length > MAX_UNDO) past.shift();
  return { present: next, past, future: [] };
}

export function undo(h: History): History {
  const last = h.past[h.past.length - 1];
  if (!last) return h;
  return { present: last.project, past: h.past.slice(0, -1), future: [{ label: last.label, project: h.present }, ...h.future] };
}

export function redo(h: History): History {
  const [first, ...rest] = h.future;
  if (!first) return h;
  return { present: first.project, past: [...h.past, { label: first.label, project: h.present }], future: rest };
}

/** Replaces the project (opening a file): a fresh history. */
export const reset = (project: Project): History => createHistory(project);
