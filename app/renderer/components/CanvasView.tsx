// The canvas area. M0 draws the page frame of the sheet (outer edge, inner drawing frame, zone
// ticks and labels) on a Canvas 2D, with wheel zoom and drag pan, so the page renderer's shape
// (world in millimetres, a view transform, devicePixelRatio) exists from the start. The real page
// renderer with the spatial index arrives in M1.

import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@shared/i18n';
import { sheetMm } from '@shared/sheets';
import { useUi } from '../state/ui';

interface View {
  /** pixels per millimetre */
  scale: number;
  /** screen position of the sheet's top-left corner, in CSS pixels */
  x: number;
  y: number;
}

/** Zone labels along an edge: columns A, B, C..., rows 1, 2, 3... (configurable zones arrive in M1). */
const label = (i: number, letters: boolean) => (letters ? String.fromCharCode(65 + i) : String(i + 1));

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function drawPage(ctx: CanvasRenderingContext2D, view: View, size: { w: number; h: number }): void {
  const { scale: k, x, y } = view;
  const sheetBg = cssVar('--sheet-bg');
  const ink = cssVar('--sheet-ink');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = sheetBg;
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 0.35;
  ctx.strokeRect(0, 0, size.w, size.h);
  // Drawing frame: PLACEHOLDER margins (20 mm left, 10 mm elsewhere), not yet checked against
  // ISO 5457 (docs/to-verify.md). They become configurable frame templates in M1.
  const m = { l: 20, r: 10, t: 10, b: 10 };
  const fx = m.l;
  const fy = m.t;
  const fw = size.w - m.l - m.r;
  const fh = size.h - m.t - m.b;
  ctx.lineWidth = 0.7;
  ctx.strokeRect(fx, fy, fw, fh);
  // Zones, 8 columns by 6 rows for the placeholder frame.
  const cols = 8;
  const rows = 6;
  ctx.lineWidth = 0.25;
  ctx.font = '3.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let c = 0; c < cols; c++) {
    const cx = fx + (fw / cols) * (c + 0.5);
    ctx.fillText(label(c, false), cx, fy - 5);
    ctx.fillText(label(c, false), cx, fy + fh + 5);
    if (c > 0) {
      const tx = fx + (fw / cols) * c;
      ctx.beginPath();
      ctx.moveTo(tx, fy - 10);
      ctx.lineTo(tx, fy);
      ctx.moveTo(tx, fy + fh);
      ctx.lineTo(tx, fy + fh + 10);
      ctx.stroke();
    }
  }
  for (let r = 0; r < rows; r++) {
    const cy = fy + (fh / rows) * (r + 0.5);
    ctx.fillText(label(r, true), fx - 10, cy);
    ctx.fillText(label(r, true), fx + fw + 5, cy);
    if (r > 0) {
      const ty = fy + (fh / rows) * r;
      ctx.beginPath();
      ctx.moveTo(fx - 10, ty);
      ctx.lineTo(fx, ty);
      ctx.moveTo(fx + fw, ty);
      ctx.lineTo(fx + fw + 10, ty);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function CanvasView() {
  const sheetSize = useUi((s) => s.sheetSize);
  const theme = useUi((s) => s.theme);
  const canvasTheme = useUi((s) => s.canvas);
  const language = useUi((s) => s.language);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const size = sheetMm(sheetSize);

  const fit = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const pad = 24;
    const scale = Math.min((el.clientWidth - pad * 2) / size.w, (el.clientHeight - pad * 2) / size.h);
    setView({ scale, x: (el.clientWidth - size.w * scale) / 2, y: (el.clientHeight - size.h * scale) / 2 });
  }, [size.w, size.h]);

  useEffect(() => {
    fit();
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    const c = canvas.current;
    const el = wrap.current;
    if (!c || !el) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(el.clientWidth * dpr);
    c.height = Math.round(el.clientHeight * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
    drawPage(ctx, view, size);
  }, [view, size, theme, canvasTheme]);

  const onWheel = (e: React.WheelEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => {
      const scale = Math.min(20, Math.max(0.2, v.scale * f));
      const r = scale / v.scale;
      return { scale, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
    });
  };

  return (
    <main className="canvas-area" aria-label={t('Canvas')}>
      <div
        ref={wrap}
        className="canvas-wrap"
        onWheel={onWheel}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          drag.current = { x: e.clientX, y: e.clientY };
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <canvas ref={canvas} data-testid="page-canvas" />
      </div>
      <div className="canvas-status" data-lang={language}>
        <span>{t('Sheet {size}, landscape, {w} × {h} mm', { size: sheetSize, w: size.w, h: size.h })}</span>
        <span>{t('Zoom')} {Math.round(view.scale * 100)}%</span>
        <button type="button" onClick={fit}>{t('Fit page')}</button>
        <span className="grow" />
        <span>{t('No project open')}. {t('The schematic editor arrives in milestone M1. This window shows the layout of the app.')}</span>
      </div>
    </main>
  );
}
