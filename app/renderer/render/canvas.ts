// Canvas 2D drawing of display primitives (shared/draw/primitives.ts) with a view transform.
// The same primitives go to the PDF, so the screen and the paper show the same drawing.

import type { Built, Prim } from '@shared/draw/primitives';
import type { Asset } from '@shared/model/types';

export interface View {
  /** pixels per millimetre */
  scale: number;
  /** screen position of the sheet's top-left corner, in CSS pixels */
  x: number;
  y: number;
}

export const FONTS = {
  sans: "system-ui, 'Helvetica Neue', Arial, sans-serif",
  serif: "'Times New Roman', Times, serif",
  mono: "'Courier New', Courier, monospace",
} as const;

/** Near-black and grey drawing colours are lightened on a dark canvas; real colours stay. */
export function displayColour(c: string, dark: boolean): string {
  if (!dark) return c;
  const n = parseInt(c.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return Math.max(r, g, b) - Math.min(r, g, b) < 40 && lum < 110 ? '#d9dee3' : c;
}

const imageCache = new Map<string, HTMLImageElement>();
/** The decoded image of an asset; undefined until loaded (`onLoad` redraws). */
export function assetImage(id: string, asset: Asset | undefined, onLoad: () => void): HTMLImageElement | undefined {
  if (!asset) return undefined;
  const key = `${id}:${asset.data.length}`;
  let img = imageCache.get(key);
  if (!img) {
    img = new Image();
    img.onload = onLoad;
    img.src = `data:${asset.mime};base64,${asset.data}`;
    imageCache.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : undefined;
}

export interface DrawOpts {
  view: View;
  dark: boolean;
  font: keyof typeof FONTS;
  assets: Record<string, Asset>;
  onImageLoad: () => void;
  /** Ids drawn highlighted. */
  selected?: Set<string>;
  highlight: string;
  /** Ids an assistant proposal adds or changes: drawn in their own colour, dashed box around them. */
  proposed?: Set<string>;
  proposedColour?: string;
}

function drawPrim(ctx: CanvasRenderingContext2D, p: Prim, o: DrawOpts, colour: string): void {
  const k = o.view.scale;
  const lw = (w: number) => Math.max(w, 0.8 / k);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  switch (p.k) {
    case 'poly':
      ctx.lineWidth = lw(p.w);
      ctx.setLineDash(p.dash ? [1.5, 1] : []);
      ctx.beginPath();
      for (let i = 0; i < p.pts.length; i += 2) (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, p.pts[i], p.pts[i + 1]);
      if (p.closed) ctx.closePath();
      if (p.fill) ctx.fill();
      ctx.stroke();
      break;
    case 'circle':
      ctx.lineWidth = lw(p.w);
      ctx.setLineDash(p.dash ? [1.5, 1] : []);
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
      if (p.fill) ctx.fill();
      ctx.stroke();
      break;
    case 'arc': {
      ctx.lineWidth = lw(p.w);
      ctx.setLineDash([]);
      let e = p.a1;
      while (e <= p.a0) e += 360;
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, p.r, (p.a0 * Math.PI) / 180, (e * Math.PI) / 180, false);
      ctx.stroke();
      break;
    }
    case 'text':
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.font = `${p.bold ? 'bold ' : ''}${p.size}px ${FONTS[o.font]}`;
      ctx.textAlign = p.anchor === 'start' ? 'left' : p.anchor === 'middle' ? 'center' : 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
      break;
    case 'image': {
      const img = assetImage(p.assetId, o.assets[p.assetId], o.onImageLoad);
      if (img) ctx.drawImage(img, p.x, p.y, p.w, p.h);
      else {
        ctx.lineWidth = lw(0.2);
        ctx.setLineDash([1, 1]);
        ctx.strokeRect(p.x, p.y, p.w, p.h);
      }
      break;
    }
  }
}

/** Draws a built page: sheet background, primitives, selection highlight. */
export function drawBuilt(ctx: CanvasRenderingContext2D, built: Built, o: DrawOpts, sheetBg: string): void {
  const { scale: k, x, y } = o.view;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = sheetBg;
  ctx.fillRect(0, 0, built.width, built.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of built.prims) drawPrim(ctx, p, o, 'c' in p ? displayColour(p.c, o.dark) : '#000');
  if (o.selected && o.selected.size) {
    for (const p of built.prims) if (p.id && o.selected.has(p.id)) drawPrim(ctx, { ...p, w: 'w' in p ? p.w + 0.5 / k : 0 } as Prim, o, o.highlight);
    ctx.setLineDash([2 / k, 2 / k]);
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = o.highlight;
    for (const it of built.items) if (o.selected.has(it.id)) ctx.strokeRect(it.box[0] - 1, it.box[1] - 1, it.box[2] - it.box[0] + 2, it.box[3] - it.box[1] + 2);
  }
  if (o.proposed && o.proposed.size) {
    const c = o.proposedColour ?? '#52c98b';
    for (const p of built.prims) if (p.id && o.proposed.has(p.id)) drawPrim(ctx, { ...p, w: 'w' in p ? p.w + 0.6 / k : 0 } as Prim, o, c);
    ctx.setLineDash([2 / k, 2 / k]);
    ctx.lineWidth = 1.2 / k;
    ctx.strokeStyle = c;
    for (const it of built.items) if (o.proposed.has(it.id)) ctx.strokeRect(it.box[0] - 1.5, it.box[1] - 1.5, it.box[2] - it.box[0] + 3, it.box[3] - it.box[1] + 3);
  }
  ctx.restore();
}
