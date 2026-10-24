// The CAD workspace state (Zustand): drafting aids, the command line (history, log, the active command),
// and what the canvas publishes for the status bar (cursor, zoom, hint). The project and the editor
// are in state/editor.ts; edits still go through its `exec`, so everything is undoable.

import { create } from 'zustand';
import { DEFAULT_OSNAP, type OsnapMode } from '@shared/cad/snap';
import type { Pt } from '@shared/model/types';
import type { Command } from '@shared/commands';

/** What a command shows on the canvas while it waits for the next point. */
export type Rubber = { kind: 'poly'; pts: Pt[]; closed?: boolean } | { kind: 'circle'; c: Pt; r: number };

/** One step of a running command: its prompt, what a click means and what typed text does. */
export interface Session {
  /** The command name shown before the prompt (LINE, MOVE). */
  name: string;
  /** The prompt in the language of the UI, options in [brackets]. */
  prompt: string;
  /** The last point: the base of the rubber band and of relative input. */
  base: Pt | null;
  /** A click gives a point, picks one object, or selects objects (window and crossing). */
  pick: 'point' | 'object' | 'select';
  rubber?(cursor: Pt): Rubber[];
  /** The edit the canvas previews while the cursor moves (not in the history). */
  preview?(cursor: Pt): Command | null;
  point(p: Pt): void;
  object?(id: string, at: Pt): void;
  /** Typed text that is not a point: an option or a number. Returns false when it is not understood. */
  text(text: string): boolean;
  enter(): void;
}

export interface Aids {
  snap: boolean;
  grid: boolean;
  ortho: boolean;
  polar: boolean;
  polarStep: number;
  osnap: boolean;
  modes: OsnapMode[];
  dyn: boolean;
}

export interface LogLine {
  id: number;
  kind: 'echo' | 'prompt' | 'info' | 'error';
  text: string;
}

interface CadState {
  aids: Aids;
  setAids(patch: Partial<Aids>): void;
  /** Ortho and polar tracking exclude each other, as in CAD programs. */
  toggle(name: 'snap' | 'grid' | 'ortho' | 'polar' | 'osnap' | 'dyn'): void;
  /** The text in the command line. */
  typing: string;
  setTyping(s: string): void;
  history: string[];
  lastCommand: string;
  active: Session | null;
  go(s: Session | null): void;
  /** The pan command: left-drag pans until Esc or Enter. */
  panMode: boolean;
  log: LogLine[];
  say(kind: LogLine['kind'], text: string): void;
  pushHistory(text: string): void;
  setLast(text: string): void;
  // Published by the canvas
  cursor: (Pt & { on: string; zone: string }) | null;
  zoom: number;
  hint: string;
  sheetText: string;
  patch(p: Partial<CadState>): void;
}

let line = 1;

export const useCad = create<CadState>((set, get) => ({
  aids: { snap: true, grid: true, ortho: false, polar: false, polarStep: 45, osnap: true, modes: [...DEFAULT_OSNAP], dyn: true },
  setAids: (p) => set({ aids: { ...get().aids, ...p } }),
  toggle: (name) => {
    const a = get().aids;
    const on = !a[name];
    set({ aids: { ...a, [name]: on, ...(on && name === 'ortho' ? { polar: false } : {}), ...(on && name === 'polar' ? { ortho: false } : {}) } });
  },
  typing: '',
  setTyping: (typing) => set({ typing }),
  history: [],
  lastCommand: '',
  active: null,
  go: (active) => set({ active }),
  panMode: false,
  log: [],
  say: (kind, text) => set((s) => ({ log: [...s.log.slice(-199), { id: line++, kind, text }] })),
  pushHistory: (text) => set((s) => ({ history: [...s.history.filter((h) => h !== text), text].slice(-100) })),
  setLast: (lastCommand) => set({ lastCommand }),
  cursor: null,
  zoom: 100,
  hint: '',
  sheetText: '',
  patch: (p) => set(p),
}));
