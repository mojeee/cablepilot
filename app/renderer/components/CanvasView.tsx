// The page canvas: draws the page from the model (shared/draw/page.ts) on Canvas 2D and handles
// the tools: select, move, wire, place symbol, annotation. Edits become commands; while a drag is
// in progress the canvas shows a preview project that is not in the history.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@shared/i18n';
import { apply, type Command } from '@shared/commands';
import { buildPage, frameRect, symbolPrims } from '@shared/draw/page';
import { runChecks } from '@shared/checks';
import type { Built, Prim } from '@shared/draw/primitives';
import { newId } from '@shared/ids';
import { GRID, hitTest, inRect, onAnyWire, snapGrid, snapPoint, type Snap } from '@shared/geometry/pick';
import { buildIndex } from '@shared/geometry/spatial';
import { orthoRoute } from '@shared/geometry/wires';
import { withProjectSymbols } from '@shared/library/types';
import { templateOf } from '@shared/model/queries';
import type { Pt, Rot, SymbolEl } from '@shared/model/types';
import { zoneIndex } from '@shared/model/zones';
import { sheetMm } from '@shared/sheets';
import { drawBuilt, type View } from '../render/canvas';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';
import { Toolbar } from './Toolbar';

const SNAP_RADIUS = 3;

type Drag =
  | { mode: 'pan'; x: number; y: number }
  | { mode: 'move'; start: Pt; ids: string[]; dx: number; dy: number }
  | { mode: 'band'; start: Pt; end: Pt; shift: boolean }
  | { mode: 'shape'; start: Pt; end: Pt };

export function CanvasView() {
  const project = useEditor((s) => s.history.present);
  const pageId = useEditor((s) => s.pageId);
  const lib = useEditor((s) => s.lib);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const placing = useEditor((s) => s.placing);
  const printPreview = useEditor((s) => s.printPreview);
  const wirePotential = useEditor((s) => s.wirePotential);
  const wireConductors = useEditor((s) => s.wireConductors);
  const pendingImage = useEditor((s) => s.pendingImage);
  const warningSign = useEditor((s) => s.warningSign);
  const theme = useUi((s) => s.theme);
  const canvasTheme = useUi((s) => s.canvas);
  const language = useUi((s) => s.language);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cursor, setCursor] = useState<Snap | null>(null);
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
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const spaceDown = useRef(false);
  const fittedFor = useRef('');

  const shown = preview ?? project;
  const page = shown.pages.find((p) => p.id === pageId);
  const pageIndex = shown.pages.findIndex((p) => p.id === pageId);
  const fullLib = useMemo(() => withProjectSymbols(lib, project.symbols), [lib, project.symbols]);
  const built: Built | null = useMemo(() => (page ? buildPage(shown, page, lib, pageIndex) : null), [shown, page, lib, pageIndex]);
  const index = useMemo(() => (built ? buildIndex(built.items) : null), [built]);
  const sheet = page ? sheetMm(page.size) : { w: 420, h: 297 };

  const fit = useCallback(() => {
    const el = wrap.current;
    if (!el || !el.clientWidth) return;
    const pad = 24;
    const scale = Math.min((el.clientWidth - pad * 2) / sheet.w, (el.clientHeight - pad * 2) / sheet.h);
    setView({ scale, x: (el.clientWidth - sheet.w * scale) / 2, y: (el.clientHeight - sheet.h * scale) / 2 });
  }, [sheet.w, sheet.h]);

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

  const dark = canvasTheme === 'dark' && !printPreview;
  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrap.current?.getBoundingClientRect();
    return { x: (e.clientX - (r?.left ?? 0) - view.x) / view.scale, y: (e.clientY - (r?.top ?? 0) - view.y) / view.scale };
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
    const opts = { view, dark, font: shown.settings.style.font, assets: shown.assets, onImageLoad: () => setRedrawTick((n) => n + 1), selected: printPreview ? undefined : new Set(selection), highlight };
    drawBuilt(ctx, built, opts, sheetBg);
    if (printPreview) return;
    if (tool === 'symbol' && placing && cursor && !placing.startsWith('box:') && !placing.startsWith('plc:') && !placing.startsWith('macro:')) {
      const gel: SymbolEl = { id: 'ghost', kind: 'symbol', symbolId: placing, x: cursor.x, y: cursor.y, rot: ghost.rot, mirror: ghost.mirror, designation: '' };
      ctx.globalAlpha = 0.65;
      drawBuilt(ctx, { prims: symbolPrims(gel, shown, fullLib) as Prim[], items: [], width: 0, height: 0 }, { ...opts, selected: undefined }, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
    }
    // Grid dots when zoomed in, then the overlays: wire draft, band, shape, snap marker.
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    if (view.scale >= 3.5) {
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.2)';
      for (let x = 0; x <= sheet.w; x += 5) for (let y = 0; y <= sheet.h; y += 5) ctx.fillRect(x - 0.12, y - 0.12, 0.24, 0.24);
    }
    ctx.lineJoin = 'round';
    const line = (pts: Pt[], colour: string, dash = false) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5 / view.scale;
      ctx.setLineDash(dash ? [3 / view.scale, 3 / view.scale] : []);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    };
    if (tool === 'wire' && cursor) {
      const pts = draft ? [...draft.pts, ...orthoRoute(draft.pts[draft.pts.length - 1], cursor, draft.horizFirst).slice(1)] : [];
      if (pts.length) line(pts, highlight);
    }
    const d = drag;
    if (d?.mode === 'band') {
      ctx.strokeStyle = highlight;
      ctx.lineWidth = 1 / view.scale;
      ctx.setLineDash([3 / view.scale, 3 / view.scale]);
      ctx.strokeRect(Math.min(d.start.x, d.end.x), Math.min(d.start.y, d.end.y), Math.abs(d.end.x - d.start.x), Math.abs(d.end.y - d.start.y));
    }
    if (d?.mode === 'shape') {
      if (tool === 'line') line([d.start, d.end], highlight);
      else ctx.strokeRect(Math.min(d.start.x, d.end.x), Math.min(d.start.y, d.end.y), Math.abs(d.end.x - d.start.x), Math.abs(d.end.y - d.start.y));
    }
    if (cursor && cursor.on !== 'grid') {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#52c98b';
      ctx.lineWidth = 1.5 / view.scale;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 1.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Markers of the findings of the electrical rule check on this page (never printed).
    for (const f of page ? (runChecks(project, lib).byPage.get(page.id) ?? []) : []) {
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
  }, [project, lib, built, page, view, size, theme, canvasTheme, selection, printPreview, cursor, draft, drag, tool, placing, ghost, dark, shown, fullLib, redrawTick, sheet.w, sheet.h]);

  // ---- editing helpers ----
  const exec = useEditor.getState().exec;
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

  const snapAt = (p: Pt, free = false): Snap => (page && !free ? snapPoint(page, fullLib, p.x, p.y, SNAP_RADIUS / Math.max(1, view.scale / 3)) : { x: snapGrid(p.x), y: snapGrid(p.y), on: 'grid' });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!page || !index || !built) return;
    const st = useEditor.getState();
    const w = toWorld(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || spaceDown.current) {
      setDrag({ mode: 'pan', x: e.clientX, y: e.clientY });
      return;
    }
    if (e.button !== 0) return;
    const sp = snapAt(w);
    switch (st.tool) {
      case 'select': {
        const hit = hitTest(page, built.items, index, w.x, w.y, Math.max(1.2, 5 / view.scale));
        if (hit) {
          const sel = st.selection.includes(hit) ? st.selection : e.shiftKey ? [...st.selection, hit] : [hit];
          st.select(e.shiftKey && st.selection.includes(hit) ? st.selection.filter((i) => i !== hit) : sel);
          if (!e.shiftKey || !st.selection.includes(hit)) setDrag({ mode: 'move', start: { x: snapGrid(w.x), y: snapGrid(w.y) }, ids: sel, dx: 0, dy: 0 });
        } else {
          if (!e.shiftKey) st.select([]);
          setDrag({ mode: 'band', start: w, end: w, shift: e.shiftKey });
        }
        break;
      }
      case 'symbol':
        if (st.placing) st.placeSymbol(st.placing, sp.x, sp.y, ghost.rot, ghost.mirror);
        break;
      case 'wire': {
        if (!draft) {
          setDraft({ pts: [{ x: sp.x, y: sp.y }], horizFirst: true });
          break;
        }
        const last = draft.pts[draft.pts.length - 1];
        if (sp.x === last.x && sp.y === last.y) break;
        const route = orthoRoute(last, sp, draft.horizFirst).slice(1);
        const ends = sp.on !== 'grid' || onAnyWire(page, sp);
        if (ends) finishWire(sp);
        else setDraft({ pts: [...draft.pts, ...route], horizFirst: draft.horizFirst });
        break;
      }
      case 'text': {
        const id = newId('t');
        st.exec({ type: 'el/add', page: page.id, elements: [{ id, kind: 'text', x: sp.x, y: sp.y, rot: 0, text: t('Text'), size: shown.settings.style.textSizes.text, align: 'left' }] });
        st.patch({ selection: [id], tool: 'select', focusText: true });
        break;
      }
      case 'line':
      case 'rect':
      case 'dashed':
        setDrag({ mode: 'shape', start: sp, end: sp });
        break;
      case 'table': {
        const id = newId('tb');
        st.exec({ type: 'el/add', page: page.id, elements: [{ id, kind: 'table', x: sp.x, y: sp.y, colWidths: [30, 30, 30], rowHeight: 7, cells: [['', '', ''], ['', '', ''], ['', '', '']], size: 3, headerRow: true }] });
        st.patch({ selection: [id], tool: 'select' });
        break;
      }
      case 'image': {
        const img = st.pendingImage;
        if (!img) break;
        const id = newId('im');
        const wmm = 40;
        st.exec({ type: 'el/add', page: page.id, elements: [{ id, kind: 'image', x: sp.x, y: sp.y, w: wmm, h: (wmm * img.h) / img.w, assetId: img.assetId }] });
        st.patch({ selection: [id], tool: 'select' });
        break;
      }
      case 'warning': {
        const id = newId('wn');
        st.exec({ type: 'el/add', page: page.id, elements: [{ id, kind: 'warning', x: sp.x, y: sp.y, size: 12, sign: st.warningSign }] });
        st.patch({ selection: [id] });
        break;
      }
    }
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
    const sp = tool === 'select' ? { x: snapGrid(w.x), y: snapGrid(w.y), on: 'grid' as const } : snapAt(w, e.altKey);
    setCursor(sp);
    if (!d) return;
    if (d.mode === 'move') {
      const dx = snapGrid(sp.x - d.start.x), dy = snapGrid(sp.y - d.start.y);
      if (dx !== d.dx || dy !== d.dy) {
        setDrag({ ...d, dx, dy });
        setPreview(dx || dy ? apply(project, { type: 'el/move', page: pageId, ids: d.ids, dx, dy }, { lib }) : null);
      }
    } else if (d.mode === 'band') setDrag({ ...d, end: w });
    else if (d.mode === 'shape') setDrag({ ...d, end: sp });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    setDrag(null);
    if (!d || !page || !built) return;
    const st = useEditor.getState();
    if (d.mode === 'move') {
      setPreview(null);
      if (d.dx || d.dy) st.exec({ type: 'el/move', page: page.id, ids: d.ids, dx: d.dx, dy: d.dy });
    } else if (d.mode === 'band') {
      const r: [number, number, number, number] = [Math.min(d.start.x, d.end.x), Math.min(d.start.y, d.end.y), Math.max(d.start.x, d.end.x), Math.max(d.start.y, d.end.y)];
      if (r[2] - r[0] > 1 || r[3] - r[1] > 1) {
        const ids = inRect(built.items, r);
        st.select(d.shift ? [...new Set([...st.selection, ...ids])] : ids);
      }
    } else if (d.mode === 'shape') {
      const end = snapAt(toWorld(e), e.altKey);
      const a = d.start, b = d.end.x === a.x && d.end.y === a.y ? end : d.end;
      if (a.x === b.x && a.y === b.y) return;
      const id = newId('e');
      if (st.tool === 'line') st.exec({ type: 'el/add', page: page.id, elements: [{ id, kind: 'line', points: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] }] });
      else st.exec({ type: 'el/add', page: page.id, elements: [{ id, kind: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), ...(st.tool === 'dashed' ? { dashed: true } : {}) }] });
      st.patch({ selection: [id] });
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
  const zoomBy = (f: number) => {
    const el = wrap.current;
    if (!el) return;
    const px = el.clientWidth / 2, py = el.clientHeight / 2;
    setView((v) => {
      const scale = Math.min(40, Math.max(0.2, v.scale * f));
      const r = scale / v.scale;
      return { scale, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
    });
  };

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) {
        if (e.key === 'Escape') el.blur();
        return;
      }
      const st = useEditor.getState();
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
        if (k === 'r' && e.shiftKey) return run(() => st.exec({ type: 'designation/renumber' }));
        return;
      }
      const sel = st.selection;
      const pg = st.pageId;
      switch (e.key) {
        case 'Escape':
          setDraft(null);
          st.setTool('select');
          st.select([]);
          return;
        case 'Delete':
        case 'Backspace': st.deleteSelection(); e.preventDefault(); return;
        case 'Enter': if (st.tool === 'wire') finishWire(); return;
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
        case '+': case '=': zoomBy(1.25); return;
        case '-': zoomBy(0.8); return;
        case 'F1': case '?': st.setDialog('shortcuts'); return;
        case '/': e.preventDefault(); document.querySelector<HTMLInputElement>('[data-testid="symbol-search"]')?.focus(); return;
      }
      switch (k) {
        case 'v': st.setTool('select'); setDraft(null); break;
        case 'w': st.setTool('wire'); break;
        case 't': st.setTool('text'); break;
        case 'l': st.setTool('line'); break;
        case 'b': st.setTool('rect'); break;
        case 'd': st.setTool('dashed'); break;
        case 'g': st.setTool('table'); break;
        case 'i': document.querySelector<HTMLButtonElement>('[data-testid="tool-image"]')?.click(); break;
        case 'n': st.setTool('warning'); break;
        case 'f': fit(); break;
        case 'r':
          if (st.tool === 'symbol') setGhost((g) => ({ ...g, rot: ((g.rot + 90) % 360) as Rot }));
          else if (sel.length) st.exec({ type: 'el/rotate', page: pg, ids: sel });
          break;
        case 'm':
          if (st.tool === 'symbol') setGhost((g) => ({ ...g, mirror: !g.mirror, rot: ((360 - g.rot) % 360) as Rot }));
          else if (sel.length) st.exec({ type: 'el/mirror', page: pg, ids: sel });
          break;
      }
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
  }, [fit, finishWire]);

  // ---- status ----
  const tpl = page ? templateOf(shown, page) : null;
  const zone = (() => {
    if (!cursor || !tpl || !page) return '';
    const f = frameRect(tpl, sheet.w, sheet.h);
    if (cursor.x < f.fx || cursor.x > f.fx + f.fw || cursor.y < f.fy || cursor.y > f.fy + f.fh) return '';
    const c = tpl.frame.columns[zoneIndex(cursor.x, f.fx, f.fw, tpl.frame.columns.length)];
    const r = tpl.frame.rows[zoneIndex(cursor.y, f.fy, f.fh, tpl.frame.rows.length)];
    return `${r ?? ''}${c ?? ''}`;
  })();
  const hint = (() => {
    switch (tool) {
      case 'select': return t('Click to select, drag to move, drag on empty space to select an area. Press F1 for all shortcuts.');
      case 'wire': return draft ? t('Click to add a corner; click on a symbol pin or a wire to finish; Tab changes the direction; Esc cancels.') : t('Click where the wire starts.');
      case 'symbol': return t('Click to place; R rotates, M mirrors, Esc stops placing.');
      case 'text': return t('Click where the text goes.');
      case 'line': return t('Drag to draw a line.');
      case 'rect': return t('Drag to draw a rectangle.');
      case 'dashed': return t('Drag to draw a dashed outline.');
      case 'table': return t('Click where the table goes.');
      case 'image': return pendingImage ? t('Click where the image goes.') : t('Choose an image file first.');
      case 'warning': return t('Click where the warning sign goes.');
    }
  })();

  return (
    <main className="canvas-area" aria-label={t('Canvas')}>
      <Toolbar />
      <div
        ref={wrap}
        className={`canvas-wrap tool-${tool}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={() => tool === 'wire' && finishWire()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvas} data-testid="page-canvas" />
      </div>
      <div className="canvas-status" data-lang={language}>
        <span>{page ? t('Sheet {size}, landscape, {w} × {h} mm', { size: page.size, w: sheet.w, h: sheet.h }) : ''}</span>
        <span>{t('Zoom')} {Math.round(view.scale * 100)}%</span>
        <button type="button" onClick={fit}>{t('Fit page')}</button>
        {cursor && <span className="mono">{cursor.x.toFixed(1)}, {cursor.y.toFixed(1)} mm{zone ? ` · ${zone}` : ''}</span>}
        <span className="status-msg" data-testid="status-message">{hint}</span>
      </div>
    </main>
  );
}

