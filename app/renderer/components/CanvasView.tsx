// The page canvas: draws the page from the model (shared/draw/page.ts) on Canvas 2D and handles the
// tools and the CAD aids: crosshair and pickbox, object snap with a marker, ortho and polar tracking,
// dynamic input, window and crossing selection, grips, right-click menus, and the steps of running
// commands (cad/sessions.ts). Edits become commands; while a drag is in progress the canvas shows a
// preview project that is not in the history. An assistant proposal is shown the same way.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@shared/i18n';
import { apply, type Command } from '@shared/commands';
import { buildPage, frameRect, symbolPrims } from '@shared/draw/page';
import { runChecks } from '@shared/checks';
import type { Built, Prim } from '@shared/draw/primitives';
import { newId } from '@shared/ids';
import { GRID, hitTest, onAnyWire, snapGrid } from '@shared/geometry/pick';
import { buildIndex } from '@shared/geometry/spatial';
import { orthoRoute } from '@shared/geometry/wires';
import { angleOf, dist } from '@shared/cad/geom';
import { gripCommand, gripsOf } from '@shared/cad/modify';
import { isCrossing, rectOf, selectInRect } from '@shared/cad/select';
import { resolvePoint, snapGeometry, type Resolved } from '@shared/cad/snap';
import { selectableIds } from '@shared/layers';
import { withProjectSymbols } from '@shared/library/types';
import { templateOf } from '@shared/model/queries';
import type { El, Pt, Rot, SymbolEl } from '@shared/model/types';
import { zoneIndex } from '@shared/model/zones';
import { sheetMm } from '@shared/sheets';
import { drawBuilt, type View } from '../render/canvas';
import { enterKey, escapeKey, runCommand, submit } from '../cad/run';
import { snapLabel } from '../cad/labels';
import { registerView } from '../cad/viewBridge';
import { useCad } from '../state/cad';
import { useChat } from '../state/chat';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';
import { Toolbar } from './Toolbar';

type Drag =
  | { mode: 'pan'; x: number; y: number }
  | { mode: 'move'; start: Pt; ids: string[]; dx: number; dy: number }
  | { mode: 'band'; start: Pt; end: Pt; shift: boolean }
  | { mode: 'grip'; el: El; i: number; to: Pt };

type Menu = { x: number; y: number } | null;

/** Draws the snap marker for an object-snap mode (screen pixels). */
function marker(ctx: CanvasRenderingContext2D, x: number, y: number, on: string): void {
  const r = 5;
  ctx.setLineDash([]);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#ffd23f';
  ctx.beginPath();
  switch (on) {
    case 'endpoint': ctx.rect(x - r, y - r, 2 * r, 2 * r); break;
    case 'midpoint': ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y + r); ctx.lineTo(x, y - r); ctx.closePath(); break;
    case 'connection': ctx.arc(x, y, r, 0, Math.PI * 2); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); break;
    case 'intersection': ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); break;
    case 'perpendicular': ctx.moveTo(x - r, y - r); ctx.lineTo(x - r, y + r); ctx.lineTo(x + r, y + r); ctx.moveTo(x - r, y); ctx.lineTo(x, y); ctx.lineTo(x, y + r); break;
    case 'nearest': ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.lineTo(x + r, y + r); ctx.closePath(); break;
  }
  ctx.stroke();
}

export function CanvasView() {
  const project = useEditor((s) => s.history.present);
  const pageId = useEditor((s) => s.pageId);
  const lib = useEditor((s) => s.lib);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const placing = useEditor((s) => s.placing);
  const printPreview = useEditor((s) => s.printPreview);
  const pendingImage = useEditor((s) => s.pendingImage);
  const theme = useUi((s) => s.theme);
  const canvasTheme = useUi((s) => s.canvas);
  const aids = useCad((s) => s.aids);
  const active = useCad((s) => s.active);
  const panMode = useCad((s) => s.panMode);
  const typing = useCad((s) => s.typing);
  const proposal = useChat((s) => s.proposal);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const prevViews = useRef<View[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cursor, setCursor] = useState<Resolved | null>(null);
  const [preview, setPreview] = useState<typeof project | null>(null);
  type Draft = { pts: Pt[]; horizFirst: boolean };
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const setDraft = useCallback((d: Draft | null | ((prev: Draft | null) => Draft | null)) => {
    const next = typeof d === 'function' ? d(draftRef.current) : d;
    draftRef.current = next;
    setDraftState(next);
  }, []);
  const [drag, setDragState] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<{ rot: Rot; mirror: boolean }>({ rot: 0, mirror: false });
  const [redrawTick, setRedrawTick] = useState(0);
  const [menu, setMenu] = useState<Menu>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const spaceDown = useRef(false);
  const fittedFor = useRef('');

  const shown = preview ?? proposal?.preview ?? project;
  const page = shown.pages.find((p) => p.id === pageId);
  const pageIndex = shown.pages.findIndex((p) => p.id === pageId);
  const fullLib = useMemo(() => withProjectSymbols(lib, project.symbols), [lib, project.symbols]);
  const built: Built | null = useMemo(() => (page ? buildPage(shown, page, lib, pageIndex) : null), [shown, page, lib, pageIndex]);
  // What can be picked: elements on layers that are on and not locked.
  const pickable = useMemo(() => {
    if (!built || !page) return null;
    const allowed = selectableIds(shown, page);
    const items = built.items.filter((i) => allowed.has(i.id));
    return { allowed, items, page: { ...page, elements: page.elements.filter((e) => allowed.has(e.id)) }, index: buildIndex(items) };
  }, [built, page, shown]);
  const geom = useMemo(() => (page ? snapGeometry(page, fullLib) : null), [page, fullLib]);
  const sheet = page ? sheetMm(page.size) : { w: 420, h: 297 };

  const setViewKeep = useCallback((f: (v: View) => View) => {
    prevViews.current = [...prevViews.current.slice(-9), viewRef.current];
    setView(f);
  }, []);
  const fit = useCallback(() => {
    const el = wrap.current;
    if (!el || !el.clientWidth) return;
    const pad = 24;
    const scale = Math.min((el.clientWidth - pad * 2) / sheet.w, (el.clientHeight - pad * 2) / sheet.h);
    setViewKeep(() => ({ scale, x: (el.clientWidth - sheet.w * scale) / 2, y: (el.clientHeight - sheet.h * scale) / 2 }));
  }, [sheet.w, sheet.h, setViewKeep]);
  const zoomBy = useCallback((f: number) => {
    const el = wrap.current;
    if (!el) return;
    const px = el.clientWidth / 2, py = el.clientHeight / 2;
    setViewKeep((v) => {
      const scale = Math.min(40, Math.max(0.2, v.scale * f));
      const r = scale / v.scale;
      return { scale, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
    });
  }, [setViewKeep]);
  const zoomWindow = useCallback((a: Pt, b: Pt) => {
    const el = wrap.current;
    if (!el) return;
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (w < 1e-6 || h < 1e-6) return;
    const scale = Math.min(40, Math.max(0.2, Math.min(el.clientWidth / w, el.clientHeight / h) * 0.95));
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    setViewKeep(() => ({ scale, x: el.clientWidth / 2 - cx * scale, y: el.clientHeight / 2 - cy * scale }));
  }, [setViewKeep]);
  useEffect(() => {
    registerView({ fit, zoomBy, zoomWindow, previous: () => { const p = prevViews.current.pop(); if (p) setView(p); } });
    return () => registerView(null);
  }, [fit, zoomBy, zoomWindow]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      if (fittedFor.current !== `${pageId}:${sheet.w}`) {
        fittedFor.current = `${pageId}:${sheet.w}`;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, pageId, sheet.w]);
  useEffect(() => {
    if (fittedFor.current !== `${pageId}:${sheet.w}`) {
      fittedFor.current = `${pageId}:${sheet.w}`;
      fit();
    }
    setDraft(null);
    setPreview(null);
  }, [pageId, sheet.w, fit]);
  useEffect(() => {
    setGhost({ rot: 0, mirror: false });
  }, [placing]);
  useEffect(() => {
    if (tool !== 'wire') setDraft(null);
  }, [tool]);
  useEffect(() => {
    if (!active) setPreview(null);
  }, [active]);

  const dark = canvasTheme === 'dark' && !printPreview;
  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrap.current?.getBoundingClientRect();
    return { x: (e.clientX - (r?.left ?? 0) - view.x) / view.scale, y: (e.clientY - (r?.top ?? 0) - view.y) / view.scale };
  };
  const toScreen = (p: Pt): Pt => ({ x: p.x * view.scale + view.x, y: p.y * view.scale + view.y });

  const resolveAt = (raw: Pt, free = false): Resolved => {
    const a = useCad.getState().aids;
    const base = useCad.getState().active?.base ?? null;
    const radius = Math.min(4, 7 / view.scale);
    return resolvePoint(raw, free ? null : base, { snap: a.snap && !free, ortho: a.ortho && !free, polar: a.polar && !free, polarStep: a.polarStep, osnap: a.osnap && !free, modes: new Set(a.modes) }, geom, radius, GRID);
  };

  // ---- drawing ----
  useEffect(() => {
    const c = canvas.current;
    const el = wrap.current;
    if (!c || !el || !built || !page) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(el.clientWidth * dpr);
    c.height = Math.round(el.clientHeight * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
    const css = getComputedStyle(document.documentElement);
    const sheetBg = printPreview ? '#ffffff' : css.getPropertyValue('--sheet-bg').trim() || '#fff';
    const highlight = css.getPropertyValue('--sel').trim() || '#ffb020';
    const opts = { view, dark, font: shown.settings.style.font, assets: shown.assets, onImageLoad: () => setRedrawTick((n) => n + 1), selected: printPreview ? undefined : new Set(selection), highlight, proposed: proposal ? new Set(proposal.highlight) : undefined, proposedColour: css.getPropertyValue('--ok').trim() || '#52c98b' };
    drawBuilt(ctx, built, opts, sheetBg);
    if (printPreview) return;
    if (tool === 'symbol' && placing && cursor && !placing.startsWith('box:') && !placing.startsWith('plc:') && !placing.startsWith('macro:')) {
      const gel: SymbolEl = { id: 'ghost', kind: 'symbol', symbolId: placing, x: cursor.pt.x, y: cursor.pt.y, rot: ghost.rot, mirror: ghost.mirror, designation: '' };
      ctx.globalAlpha = 0.65;
      drawBuilt(ctx, { prims: symbolPrims(gel, shown, fullLib) as Prim[], items: [], width: 0, height: 0 }, { ...opts, selected: undefined, proposed: undefined }, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
    }
    // Grid dots (grid display, F7) once the grid is far enough apart on screen, then the overlays.
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    if (aids.grid && view.scale >= 3) {
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.2)';
      for (let x = 0; x <= sheet.w; x += 5) for (let y = 0; y <= sheet.h; y += 5) ctx.fillRect(x - 0.12, y - 0.12, 0.24, 0.24);
    }
    ctx.lineJoin = 'round';
    const line = (pts: Pt[], colour: string, dash = false, w = 1.5) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = w / view.scale;
      ctx.setLineDash(dash ? [3 / view.scale, 3 / view.scale] : []);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    };
    if (tool === 'wire' && cursor) {
      const pts = draft ? [...draft.pts, ...orthoRoute(draft.pts[draft.pts.length - 1], cursor.pt, draft.horizFirst).slice(1)] : [];
      if (pts.length) line(pts, highlight);
    }
    // The running command's rubber band.
    if (active?.rubber && cursor) {
      for (const r of active.rubber(cursor.pt)) {
        ctx.strokeStyle = highlight;
        ctx.lineWidth = 1.5 / view.scale;
        ctx.setLineDash([3 / view.scale, 3 / view.scale]);
        ctx.beginPath();
        if (r.kind === 'poly') {
          r.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          if (r.closed) ctx.closePath();
        } else ctx.arc(r.c.x, r.c.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Polar tracking ray.
    if (cursor?.track) {
      const far = Math.max(sheet.w, sheet.h) * 2;
      const a = (cursor.track.angle * Math.PI) / 180;
      line([cursor.track.from, { x: cursor.track.from.x + Math.cos(a) * far, y: cursor.track.from.y - Math.sin(a) * far }], 'rgba(255,210,63,0.55)', true, 1);
    }
    const d = drag;
    if (d?.mode === 'band') {
      const crossing = isCrossing(d.start, d.end);
      const col = d.shift ? '#ff5a4f' : crossing ? '#52c98b' : '#4da3ff';
      ctx.fillStyle = col + '24';
      ctx.fillRect(Math.min(d.start.x, d.end.x), Math.min(d.start.y, d.end.y), Math.abs(d.end.x - d.start.x), Math.abs(d.end.y - d.start.y));
      ctx.strokeStyle = col;
      ctx.lineWidth = 1 / view.scale;
      ctx.setLineDash(crossing ? [3 / view.scale, 3 / view.scale] : []);
      ctx.strokeRect(Math.min(d.start.x, d.end.x), Math.min(d.start.y, d.end.y), Math.abs(d.end.x - d.start.x), Math.abs(d.end.y - d.start.y));
    }
    ctx.restore();
    // Grips of the selected objects (screen space).
    if (selection.length > 0 && selection.length <= 50 && !printPreview) {
      const sel = new Set(selection);
      ctx.setLineDash([]);
      for (const e of page.elements) {
        if (!sel.has(e.id)) continue;
        for (const g of gripsOf(e)) {
          const p = toScreen(g.pt);
          ctx.fillStyle = '#4da3ff';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.fillRect(p.x - 3.5, p.y - 3.5, 7, 7);
          ctx.strokeRect(p.x - 3.5, p.y - 3.5, 7, 7);
        }
      }
    }
    // Snap marker, crosshair and pickbox (screen space).
    if (cursor) {
      const p = toScreen(cursor.pt);
      if (cursor.on !== 'grid' && cursor.on !== 'free' && cursor.on !== 'polar' && cursor.on !== 'ortho') {
        marker(ctx, p.x, p.y, cursor.on);
        const label = snapLabel(cursor.on);
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = '#ffd23f';
        ctx.textBaseline = 'top';
        ctx.fillText(label, p.x + 10, p.y + 8);
      }
      const col = dark ? 'rgba(235,240,245,0.55)' : 'rgba(20,25,30,0.55)';
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, p.y + 0.5); ctx.lineTo(el.clientWidth, p.y + 0.5);
      ctx.moveTo(p.x + 0.5, 0); ctx.lineTo(p.x + 0.5, el.clientHeight);
      ctx.stroke();
      if (!active || active.pick !== 'point') ctx.strokeRect(p.x - 4.5, p.y - 4.5, 9, 9);
    }
    // Markers of the findings of the electrical rule check on this page (never printed).
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    for (const f of runChecks(project, lib).byPage.get(page.id) ?? []) {
      if (!f.at) continue;
      const r = 3.2;
      ctx.setLineDash([]);
      ctx.fillStyle = f.severity === 'error' ? '#e5392d' : f.severity === 'warning' ? '#f0a63a' : '#4f8fe0';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(f.at.x, f.at.y - r - 1, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = f.severity === 'warning' ? '#1a1100' : '#ffffff';
      ctx.font = `bold ${r * 1.6}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', f.at.x, f.at.y - r - 0.9);
    }
    ctx.restore();
  }, [project, lib, built, page, view, size, theme, canvasTheme, selection, printPreview, cursor, draft, drag, tool, placing, ghost, dark, shown, fullLib, redrawTick, sheet.w, sheet.h, aids.grid, active, proposal]);

  // ---- editing helpers ----
  const finishWire = useCallback((extra?: Pt) => {
    const d = draftRef.current;
    if (!d) return;
    const st = useEditor.getState();
    const pts = extra ? [...d.pts, ...orthoRoute(d.pts[d.pts.length - 1], extra, d.horizFirst).slice(1)] : d.pts;
    setDraft(null);
    if (pts.length >= 2) {
      const cmd: Command = { type: 'wire/add', page: st.pageId, id: newId('w'), points: pts, ...(st.wirePotential ? { potential: st.wirePotential } : {}), ...(st.wireConductors > 1 ? { conductors: st.wireConductors } : {}) };
      st.exec(cmd);
      useUi.getState().addMessage('info', () => t('Wire drawn.'));
    }
  }, [setDraft]);

  const gripAt = (w: Pt): { el: El; i: number } | null => {
    if (!page || selection.length === 0 || selection.length > 50) return null;
    const sel = new Set(selection);
    const tol = 5 / view.scale;
    for (const e of page.elements) {
      if (!sel.has(e.id)) continue;
      for (const g of gripsOf(e)) if (Math.abs(g.pt.x - w.x) <= tol && Math.abs(g.pt.y - w.y) <= tol) return { el: e, i: g.i };
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setMenu(null);
    if (!page || !pickable || !built) return;
    const st = useEditor.getState();
    const cad = useCad.getState();
    const w = toWorld(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 2) return;
    if (e.button === 1 || spaceDown.current || (cad.panMode && e.button === 0)) {
      setDrag({ mode: 'pan', x: e.clientX, y: e.clientY });
      return;
    }
    if (e.button !== 0) return;
    const sp = resolveAt(w, e.altKey);
    const a = cad.active;
    if (a && a.pick === 'point') {
      a.point(sp.pt);
      return;
    }
    if (a && a.pick === 'object') {
      const hit = hitTest(pickable.page, pickable.items, pickable.index, w.x, w.y, Math.max(1.2, 5 / view.scale));
      if (hit) a.object?.(hit, w);
      return;
    }
    switch (st.tool) {
      case 'select': {
        const g = gripAt(w);
        if (g) {
          setDrag({ mode: 'grip', el: g.el, i: g.i, to: sp.pt });
          return;
        }
        const hit = hitTest(pickable.page, pickable.items, pickable.index, w.x, w.y, Math.max(1.2, 5 / view.scale));
        if (hit) {
          const sel = st.selection.includes(hit) ? st.selection : e.shiftKey ? [...st.selection, hit] : [hit];
          st.select(e.shiftKey && st.selection.includes(hit) ? st.selection.filter((i) => i !== hit) : sel);
          if (!e.shiftKey || !st.selection.includes(hit)) setDrag({ mode: 'move', start: { x: snapGrid(w.x), y: snapGrid(w.y) }, ids: sel, dx: 0, dy: 0 });
        } else {
          setDrag({ mode: 'band', start: w, end: w, shift: e.shiftKey });
        }
        break;
      }
      case 'symbol':
        if (st.placing) st.placeSymbol(st.placing, sp.pt.x, sp.pt.y, ghost.rot, ghost.mirror);
        break;
      case 'wire': {
        if (!draft) {
          setDraft({ pts: [{ x: sp.pt.x, y: sp.pt.y }], horizFirst: true });
          break;
        }
        const last = draft.pts[draft.pts.length - 1];
        if (sp.pt.x === last.x && sp.pt.y === last.y) break;
        const route = orthoRoute(last, sp.pt, draft.horizFirst).slice(1);
        const ends = !!sp.via || onAnyWire(page, sp.pt);
        if (ends) finishWire(sp.pt);
        else setDraft({ pts: [...draft.pts, ...route], horizFirst: draft.horizFirst });
        break;
      }
      case 'text': {
        const id = newId('t');
        st.exec({ type: 'el/add', page: page.id, elements: [{ id, kind: 'text', x: sp.pt.x, y: sp.pt.y, rot: 0, text: t('Text'), size: shown.settings.style.textSizes.text, align: 'left' }] });
        st.patch({ selection: [id], tool: 'select', focusText: true });
        break;
      }
      case 'table': {
        const id = newId('tb');
        st.exec({ type: 'el/add', page: page.id, elements: [{ id, kind: 'table', x: sp.pt.x, y: sp.pt.y, colWidths: [30, 30, 30], rowHeight: 7, cells: [['', '', ''], ['', '', ''], ['', '', '']], size: 3, headerRow: true }] });
        st.patch({ selection: [id], tool: 'select' });
        break;
      }
      case 'image': {
        const img = st.pendingImage;
        if (!img) break;
        const id = newId('im');
        const wmm = 40;
        st.exec({ type: 'el/add', page: page.id, elements: [{ id, kind: 'image', x: sp.pt.x, y: sp.pt.y, w: wmm, h: (wmm * img.h) / img.w, assetId: img.assetId }] });
        st.patch({ selection: [id], tool: 'select' });
        break;
      }
      case 'warning': {
        const id = newId('wn');
        st.exec({ type: 'el/add', page: page.id, elements: [{ id, kind: 'warning', x: sp.pt.x, y: sp.pt.y, size: 12, sign: st.warningSign }] });
        st.patch({ selection: [id] });
        break;
      }
    }
  };

  const publish = (res: Resolved | null) => {
    if (!res || !page) return useCad.getState().patch({ cursor: null });
    const tpl = templateOf(shown, page);
    const f = frameRect(tpl, sheet.w, sheet.h);
    const inside = res.pt.x >= f.fx && res.pt.x <= f.fx + f.fw && res.pt.y >= f.fy && res.pt.y <= f.fy + f.fh;
    const zone = inside ? `${tpl.frame.rows[zoneIndex(res.pt.y, f.fy, f.fh, tpl.frame.rows.length)] ?? ''}${tpl.frame.columns[zoneIndex(res.pt.x, f.fx, f.fw, tpl.frame.columns.length)] ?? ''}` : '';
    useCad.getState().patch({ cursor: { x: res.pt.x, y: res.pt.y, on: res.on, zone } });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d?.mode === 'pan') {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      setDrag({ mode: 'pan', x: e.clientX, y: e.clientY });
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
    const w = toWorld(e);
    const sp = resolveAt(w, e.altKey);
    setCursor(sp);
    publish(sp);
    const a = useCad.getState().active;
    if (a?.preview && !d) {
      const cmd = a.preview(sp.pt);
      setPreview(cmd ? apply(project, cmd, { lib }) : null);
    }
    if (!d) return;
    if (d.mode === 'move') {
      const dx = snapGrid(sp.pt.x - d.start.x), dy = snapGrid(sp.pt.y - d.start.y);
      if (dx !== d.dx || dy !== d.dy) {
        setDrag({ ...d, dx, dy });
        setPreview(dx || dy ? apply(project, { type: 'el/move', page: pageId, ids: d.ids, dx, dy }, { lib }) : null);
      }
    } else if (d.mode === 'band') setDrag({ ...d, end: w });
    else if (d.mode === 'grip') {
      const to = resolveAt(w, e.altKey).pt;
      setDrag({ ...d, to });
      const cmd = gripCommand(pageId, d.el, d.i, to);
      setPreview(cmd ? apply(project, cmd, { lib }) : null);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    setDrag(null);
    if (e.button === 2) {
      setMenu({ x: e.clientX, y: e.clientY });
      return;
    }
    if (!d || !page || !built || !pickable) return;
    const st = useEditor.getState();
    if (d.mode === 'move') {
      setPreview(null);
      if (d.dx || d.dy) st.exec({ type: 'el/move', page: page.id, ids: d.ids, dx: d.dx, dy: d.dy });
    } else if (d.mode === 'grip') {
      setPreview(null);
      const cmd = gripCommand(page.id, d.el, d.i, d.to);
      if (cmd) st.exec(cmd);
    } else if (d.mode === 'band') {
      const r = rectOf(d.start, d.end);
      if (r[2] - r[0] > 1 || r[3] - r[1] > 1) {
        const ids = selectInRect(page, pickable.items, r, isCrossing(d.start, d.end), pickable.allowed);
        // Shift removes from the selection, like in CAD programs; otherwise the area replaces it.
        st.select(d.shift ? st.selection.filter((i) => !ids.includes(i)) : ids);
      } else if (!d.shift) st.select([]);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => {
      const scale = Math.min(40, Math.max(0.2, v.scale * f));
      const r = scale / v.scale;
      return { scale, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
    });
  };

  // ---- keyboard ----
  const focusCommandLine = () => document.querySelector<HTMLInputElement>('[data-testid="cmd-input"]')?.focus();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cad = useCad.getState();
      const st = useEditor.getState();
      // Drafting aids work everywhere, also while typing in the command line.
      const fkey: Record<string, 'grid' | 'ortho' | 'snap' | 'osnap' | 'polar'> = { F7: 'grid', F8: 'ortho', F9: 'snap', F3: 'osnap', F10: 'polar' };
      if (fkey[e.key]) { e.preventDefault(); cad.toggle(fkey[e.key]); return; }
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) {
        if (e.key === 'Escape' && el.getAttribute('data-testid') !== 'cmd-input') el.blur();
        return;
      }
      if (st.dialog) {
        if (e.key === 'Escape') st.setDialog(null);
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.key === ' ') {
        spaceDown.current = true;
        e.preventDefault();
        return;
      }
      if (mod) {
        const run = (fn: () => void) => {
          e.preventDefault();
          fn();
        };
        if (k === 'z') return run(e.shiftKey ? st.redo : st.undo);
        if (k === 'y') return run(st.redo);
        if (k === 's') return run(() => void st.save(e.shiftKey));
        if (k === 'o') return run(() => void st.openFile());
        if (k === 'n') return run(st.newProject);
        if (k === 'p') return run(() => void st.exportPdf('all'));
        if (k === ',') return run(() => st.setDialog('settings'));
        if (k === 'a') return run(() => st.select(st.page()?.elements.map((x) => x.id) ?? []));
        if (k === 'c') return run(st.copy);
        if (k === 'v') return run(st.paste);
        if (k === 'd') return run(() => { st.copy(); st.paste(); });
        if (k === '0') return run(() => runCommand('CLEANSCREEN'));
        if (k === 'r' && e.shiftKey) return run(() => st.exec({ type: 'designation/renumber' }));
        return;
      }
      const sel = st.selection;
      const pg = st.pageId;
      switch (e.key) {
        case 'Escape': setDraft(null); setMenu(null); escapeKey(); return;
        case 'Delete':
        case 'Backspace': st.deleteSelection(); e.preventDefault(); return;
        case 'Enter': if (st.tool === 'wire' && !cad.active) finishWire(); else enterKey(); return;
        case 'Tab':
          if (st.tool === 'wire') { e.preventDefault(); setDraft((d) => (d ? { ...d, horizFirst: !d.horizFirst } : d)); }
          return;
        case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
          if (!sel.length) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : GRID;
          st.exec({ type: 'el/move', page: pg, ids: sel, dx: e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy: e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0 });
          return;
        }
        case 'PageUp': case 'PageDown': {
          const p = st.project();
          const i = p.pages.findIndex((x) => x.id === st.pageId);
          const n = p.pages[i + (e.key === 'PageUp' ? -1 : 1)];
          if (n) st.setPage(n.id);
          return;
        }
        case 'F1': st.setDialog('shortcuts'); return;
      }
      if (e.key.length !== 1) return;
      // While a command runs, printable keys are typed into the command line (options, numbers, coordinates).
      if (cad.active) { e.preventDefault(); cad.setTyping(cad.typing + e.key); focusCommandLine(); return; }
      if (e.key === '?') { st.setDialog('shortcuts'); return; }
      // Single-key shortcuts that are not command names: V select, W wire, F fit; R and M while placing a symbol.
      if (k === 'v') { st.setTool('select'); setDraft(null); return; }
      if (k === 'w') { st.setTool('wire'); return; }
      if (k === 'f') { fit(); return; }
      if (st.tool === 'symbol' && k === 'r') { setGhost((g) => ({ ...g, rot: ((g.rot + 90) % 360) as Rot })); return; }
      if (st.tool === 'symbol' && k === 'm') { setGhost((g) => ({ ...g, mirror: !g.mirror, rot: ((360 - g.rot) % 360) as Rot })); return; }
      if (e.key === '+' || e.key === '=') { zoomBy(1.25); return; }
      if (e.key === '-') { zoomBy(0.8); return; }
      if (e.key === '/') { e.preventDefault(); document.querySelector<HTMLInputElement>('[data-testid="symbol-search"]')?.focus(); return; }
      // Anything else starts a command: focus the command line and type there (L, PL, REC, M, CO, ...).
      if (/[a-z0-9@<.,]/i.test(e.key)) { e.preventDefault(); cad.setTyping(cad.typing + e.key); focusCommandLine(); }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceDown.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [fit, zoomBy, finishWire]);

  // ---- status ----
  const hint = (() => {
    switch (tool) {
      case 'select': return t('Click to select, drag to move, drag on empty space to select an area. Press F1 for all shortcuts.');
      case 'wire': return draft ? t('Click to add a corner; click on a symbol pin or a wire to finish; Tab changes the direction; Esc cancels.') : t('Click where the wire starts.');
      case 'symbol': return t('Click to place; R rotates, M mirrors, Esc stops placing.');
      case 'text': return t('Click where the text goes.');
      case 'table': return t('Click where the table goes.');
      case 'image': return pendingImage ? t('Click where the image goes.') : t('Choose an image file first.');
      case 'warning': return t('Click where the warning sign goes.');
    }
  })();
  useEffect(() => {
    useCad.getState().patch({ hint, zoom: Math.round(view.scale * 100), sheetText: page ? t('Sheet {size}, landscape, {w} × {h} mm', { size: page.size, w: sheet.w, h: sheet.h }) : '' });
  }, [hint, view.scale, page, sheet.w, sheet.h]);

  // Dynamic input: length and angle (or the typed text) next to the cursor while a command waits for a point.
  const dyn = (() => {
    if (!aids.dyn || !cursor || printPreview) return null;
    const p = toScreen(cursor.pt);
    const base = active?.base;
    const live = base ? `${(Math.round(dist(base, cursor.pt) * 100) / 100).toFixed(2)} < ${Math.round(angleOf(base, cursor.pt))}°` : active || tool === 'wire' || tool === 'symbol' ? `${cursor.pt.x.toFixed(1)}, ${cursor.pt.y.toFixed(1)}` : null;
    if (!live) return null;
    return { x: p.x + 16, y: p.y + 18, text: typing || live, typed: !!typing };
  })();

  const st = useEditor.getState();
  const last = useCad.getState().lastCommand;
  const menuItems: { id: string; label: string; run: () => void; sep?: boolean; disabled?: boolean }[] = [];
  if (menu) {
    if (active) menuItems.push({ id: 'enter', label: t('Enter'), run: () => enterKey() }, { id: 'cancel', label: t('Cancel'), run: () => escapeKey() }, { id: 's1', label: '', run: () => undefined, sep: true });
    else if (last) menuItems.push({ id: 'repeat', label: t('Repeat {command}', { command: last }), run: () => submit('') }, { id: 's1', label: '', run: () => undefined, sep: true });
    if (selection.length) for (const c of ['MOVE', 'COPY', 'ROTATE', 'MIRROR', 'ERASE']) menuItems.push({ id: c, label: c === 'MOVE' ? t('Move') : c === 'COPY' ? t('Copy') : c === 'ROTATE' ? t('Rotate') : c === 'MIRROR' ? t('Mirror') : t('Erase'), run: () => runCommand(c) });
    if (selection.length) menuItems.push({ id: 's2', label: '', run: () => undefined, sep: true });
    menuItems.push(
      { id: 'all', label: t('Select all'), run: () => runCommand('SELECTALL') },
      { id: 'undo', label: t('Undo'), run: () => st.undo(), disabled: useEditor.getState().history.past.length === 0 },
      { id: 'redo', label: t('Redo'), run: () => st.redo(), disabled: useEditor.getState().history.future.length === 0 },
      { id: 'paste', label: t('Paste'), run: () => st.paste(), disabled: st.clipboard.length === 0 },
      { id: 's3', label: '', run: () => undefined, sep: true },
      { id: 'extents', label: t('Zoom to the whole page'), run: () => runCommand('EXTENTS') },
      { id: 'pan', label: t('Pan the view'), run: () => runCommand('PAN') },
    );
  }

  return (
    <main className="canvas-area" aria-label={t('Canvas')}>
      <Toolbar />
      <div
        ref={wrap}
        className={`canvas-wrap tool-${tool}${panMode ? ' panning' : ''}`}
        data-testid="canvas-wrap"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { setCursor(null); publish(null); }}
        onDoubleClick={() => tool === 'wire' && finishWire()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvas} data-testid="page-canvas" />
        {dyn && <div className={`dyn${dyn.typed ? ' typed' : ''}`} data-testid="dyn-input" style={{ left: dyn.x, top: dyn.y }}>{dyn.text}</div>}
        {menu && (
          <div className="ctx-menu" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
            {menuItems.map((m) => (m.sep ? <hr key={m.id} /> : <button key={m.id} type="button" role="menuitem" data-testid={`ctx-${m.id}`} disabled={m.disabled} onClick={() => { setMenu(null); m.run(); }}>{m.label}</button>))}
          </div>
        )}
      </div>
    </main>
  );
}
