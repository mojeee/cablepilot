// The workspace layout: which panel sits in which dock (left, right, bottom, or hidden), how wide
// the docks are, which panels are collapsed, whether the ribbon is collapsed. Saved per user in the
// settings of the main process (shared/settings.ts). Pure: the docking UI is in app/renderer.

export const PANELS = ['pages', 'symbols', 'properties', 'layers', 'messages', 'chat'] as const;
export type PanelId = (typeof PANELS)[number];
export const DOCKS = ['left', 'right', 'bottom', 'hidden'] as const;
export type Dock = (typeof DOCKS)[number];

export interface Layout {
  /** The dock of every panel; the order inside a dock is the order of PANELS. */
  dock: Record<PanelId, Dock>;
  /** Left and right dock widths and the bottom dock height, in pixels. */
  size: { left: number; right: number; bottom: number };
  collapsed: PanelId[];
  ribbonCollapsed: boolean;
}

export const SIZE_LIMITS = { left: [160, 600], right: [200, 700], bottom: [80, 500] } as const;

export const DEFAULT_LAYOUT: Layout = {
  dock: { pages: 'left', symbols: 'left', properties: 'right', layers: 'right', messages: 'bottom', chat: 'right' },
  size: { left: 250, right: 320, bottom: 130 },
  collapsed: ['layers'],
  ribbonCollapsed: false,
};

const clamp = (v: unknown, [lo, hi]: readonly [number, number], dflt: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);

/** Reads untrusted JSON into a valid layout: unknown or invalid fields fall back to the defaults. */
export function parseLayout(raw: unknown): Layout {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = typeof o.dock === 'object' && o.dock !== null ? (o.dock as Record<string, unknown>) : {};
  const s = typeof o.size === 'object' && o.size !== null ? (o.size as Record<string, unknown>) : {};
  const dock = Object.fromEntries(PANELS.map((p) => [p, (DOCKS as readonly unknown[]).includes(d[p]) ? (d[p] as Dock) : DEFAULT_LAYOUT.dock[p]])) as Record<PanelId, Dock>;
  return {
    dock,
    size: { left: clamp(s.left, SIZE_LIMITS.left, DEFAULT_LAYOUT.size.left), right: clamp(s.right, SIZE_LIMITS.right, DEFAULT_LAYOUT.size.right), bottom: clamp(s.bottom, SIZE_LIMITS.bottom, DEFAULT_LAYOUT.size.bottom) },
    collapsed: Array.isArray(o.collapsed) ? PANELS.filter((p) => (o.collapsed as unknown[]).includes(p)) : [...DEFAULT_LAYOUT.collapsed],
    ribbonCollapsed: o.ribbonCollapsed === true,
  };
}

/** The panels of a dock, in order. */
export const panelsIn = (l: Layout, dock: Dock): PanelId[] => PANELS.filter((p) => l.dock[p] === dock);

export const withDock = (l: Layout, panel: PanelId, dock: Dock): Layout => ({ ...l, dock: { ...l.dock, [panel]: dock }, collapsed: l.collapsed.filter((p) => p !== panel) });
export const withSize = (l: Layout, side: 'left' | 'right' | 'bottom', px: number): Layout => ({ ...l, size: { ...l.size, [side]: clamp(px, SIZE_LIMITS[side], DEFAULT_LAYOUT.size[side]) } });
export const withCollapsed = (l: Layout, panel: PanelId, collapsed: boolean): Layout => ({ ...l, collapsed: PANELS.filter((p) => (p === panel ? collapsed : l.collapsed.includes(p))) });
/** Shows a hidden panel in the dock it would sit in by default (or leaves it where it is). */
export const withShown = (l: Layout, panel: PanelId): Layout => (l.dock[panel] === 'hidden' ? withDock(l, panel, DEFAULT_LAYOUT.dock[panel]) : withCollapsed(l, panel, false));
