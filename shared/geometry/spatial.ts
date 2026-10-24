// A uniform grid over a page for picking and snapping: insert boxes, query a point or a rectangle.
import type { Box } from '../draw/primitives';

export class SpatialIndex {
  private cells = new Map<number, string[]>();
  private boxes = new Map<string, Box>();
  constructor(private cell = 20) {}
  private key(cx: number, cy: number): number {
    return cx * 100003 + cy;
  }
  insert(id: string, box: Box): void {
    this.boxes.set(id, box);
    for (let cx = Math.floor(box[0] / this.cell); cx <= Math.floor(box[2] / this.cell); cx++) {
      for (let cy = Math.floor(box[1] / this.cell); cy <= Math.floor(box[3] / this.cell); cy++) {
        const k = this.key(cx, cy);
        const l = this.cells.get(k);
        if (l) l.push(id);
        else this.cells.set(k, [id]);
      }
    }
  }
  /** Ids whose box intersects the rectangle (padded by `pad`). */
  query(x0: number, y0: number, x1: number, y1: number, pad = 0): string[] {
    const found = new Set<string>();
    for (let cx = Math.floor((x0 - pad) / this.cell); cx <= Math.floor((x1 + pad) / this.cell); cx++) {
      for (let cy = Math.floor((y0 - pad) / this.cell); cy <= Math.floor((y1 + pad) / this.cell); cy++) {
        for (const id of this.cells.get(this.key(cx, cy)) ?? []) {
          const b = this.boxes.get(id);
          if (b && b[0] <= x1 + pad && b[2] >= x0 - pad && b[1] <= y1 + pad && b[3] >= y0 - pad) found.add(id);
        }
      }
    }
    return [...found];
  }
  at(x: number, y: number, pad = 0): string[] {
    return this.query(x, y, x, y, pad);
  }
  get size(): number {
    return this.boxes.size;
  }
}

export function buildIndex(items: { id: string; box: Box }[]): SpatialIndex {
  const idx = new SpatialIndex();
  for (const it of items) idx.insert(it.id, it.box);
  return idx;
}
