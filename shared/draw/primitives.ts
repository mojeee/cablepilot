// One display-primitive vocabulary: the Canvas 2D renderer and the PDF writer both draw these, so
// screen and paper show the same geometry. Coordinates are page millimetres, y down. Colours are
// resolved hex strings (the drawing style is applied when the primitives are built).

export type Anchor = 'start' | 'middle' | 'end';
export type Prim =
  | { k: 'poly'; pts: number[]; closed?: boolean; fill?: boolean; w: number; c: string; dash?: boolean; id?: string }
  | { k: 'circle'; cx: number; cy: number; r: number; w: number; c: string; fill?: boolean; dash?: boolean; id?: string }
  /** Clockwise on screen from a0 to a1, degrees from the +x axis. */
  | { k: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; w: number; c: string; id?: string }
  | { k: 'text'; x: number; y: number; text: string; size: number; anchor: Anchor; rot: number; c: string; bold?: boolean; id?: string }
  | { k: 'image'; x: number; y: number; w: number; h: number; assetId: string; id?: string };

export type Box = [number, number, number, number];

export interface Built {
  prims: Prim[];
  /** Selectable objects with their bounding boxes (page millimetres). */
  items: { id: string; box: Box }[];
  width: number;
  height: number;
}

/** Rough text width: average glyph advance 0.55 of the font size. Used for boxes, not for layout on paper. */
export const textWidth = (text: string, size: number): number => text.length * size * 0.55;

export function primBox(p: Prim): Box {
  switch (p.k) {
    case 'poly': {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < p.pts.length; i += 2) {
        x0 = Math.min(x0, p.pts[i]); x1 = Math.max(x1, p.pts[i]);
        y0 = Math.min(y0, p.pts[i + 1]); y1 = Math.max(y1, p.pts[i + 1]);
      }
      return [x0, y0, x1, y1];
    }
    case 'circle':
    case 'arc':
      return [p.cx - p.r, p.cy - p.r, p.cx + p.r, p.cy + p.r];
    case 'image':
      return [p.x, p.y, p.x + p.w, p.y + p.h];
    case 'text': {
      const w = textWidth(p.text, p.size);
      const x0 = p.anchor === 'start' ? 0 : p.anchor === 'middle' ? -w / 2 : -w;
      const corners = [[x0, -p.size * 0.75], [x0 + w, -p.size * 0.75], [x0, p.size * 0.25], [x0 + w, p.size * 0.25]];
      const a = (p.rot * Math.PI) / 180;
      const cs = Math.cos(a), sn = Math.sin(a);
      const xs = corners.map(([x, y]) => p.x + x * cs - y * sn);
      const ys = corners.map(([x, y]) => p.y + x * sn + y * cs);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
  }
}

export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const x of boxes) {
    b[0] = Math.min(b[0], x[0]); b[1] = Math.min(b[1], x[1]);
    b[2] = Math.max(b[2], x[2]); b[3] = Math.max(b[3], x[3]);
  }
  return b;
}

export const inBox = (b: Box, x: number, y: number, pad = 0): boolean => x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad;
export const boxesTouch = (a: Box, b: Box): boolean => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
