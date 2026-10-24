// DXF export of a page and import as plain graphics (brief, M3). ASCII DXF, AutoCAD 2000 (AC1015)
// entities: LWPOLYLINE, CIRCLE, ARC and TEXT out; LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, TEXT and
// MTEXT in. We write and read the documented format ourselves: no dependency and no licence to
// carry. Units are millimetres; the DXF y axis points up, the page's down, so y is flipped.

import type { Prim } from '../draw/primitives';
import type { El, LineEl, TextEl } from '../model/types';

const f = (n: number) => String(Math.round(n * 1e4) / 1e4);
const hexInt = (c: string) => parseInt(c.slice(1), 16) || 0;

/** `layer` is one layer name for everything, or a function that names the layer of each primitive (the cabinet layout writes one layer per kind of item). */
export function writeDxf(prims: Prim[], pageHeight: number, layer: string | ((p: Prim) => string) = 'CABLEPILOT'): string {
  const layerOf = typeof layer === 'string' ? () => layer : layer;
  const names = [...new Set(prims.map(layerOf))];
  if (names.length === 0) names.push(typeof layer === 'string' ? layer : 'CABLEPILOT');
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), String(v));
  const y = (v: number) => pageHeight - v;
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1015'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, 'Dashed'); g(72, 65); g(73, 2); g(40, 2.5); g(49, 1.5); g(49, -1);
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, names.length);
  for (const n of names) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, 7); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const head = (type: string, p: { c: string; dash?: boolean }) => { g(0, type); g(8, layerOf(p as Prim)); g(6, p.dash ? 'DASHED' : 'BYLAYER'); g(420, hexInt(p.c)); };
  for (const p of prims) {
    switch (p.k) {
      case 'poly':
        head('LWPOLYLINE', p); g(100, 'AcDbPolyline'); g(90, p.pts.length / 2); g(70, p.closed ? 1 : 0);
        for (let i = 0; i < p.pts.length; i += 2) { g(10, f(p.pts[i])); g(20, f(y(p.pts[i + 1]))); }
        break;
      case 'circle': head('CIRCLE', p); g(100, 'AcDbCircle'); g(10, f(p.cx)); g(20, f(y(p.cy))); g(40, f(p.r)); break;
      case 'arc': {
        // Clockwise on the page from a0 to a1 is counter-clockwise from -a1 to -a0 with y up.
        const m = (a: number) => ((a % 360) + 360) % 360;
        head('ARC', p); g(100, 'AcDbCircle'); g(10, f(p.cx)); g(20, f(y(p.cy))); g(40, f(p.r)); g(100, 'AcDbArc'); g(50, f(m(-p.a1))); g(51, f(m(-p.a0)));
        break;
      }
      case 'text': {
        head('TEXT', p); g(100, 'AcDbText'); g(10, f(p.x)); g(20, f(y(p.y))); g(40, f(p.size)); g(1, p.text.replace(/[\r\n]+/g, ' ')); g(50, f(((-p.rot % 360) + 360) % 360));
        if (p.anchor !== 'start') { g(72, p.anchor === 'middle' ? 1 : 2); g(11, f(p.x)); g(21, f(y(p.y))); }
        g(100, 'AcDbText');
        break;
      }
      case 'image': break;
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return `${out.join('\r\n')}\r\n`;
}

export interface DxfShape {
  /** A polyline (lines, polylines, circles and arcs as segments) or a text. */
  pts?: { x: number; y: number }[];
  text?: { x: number; y: number; h: number; rot: number; value: string; align: 'left' | 'center' | 'right' };
}
export interface DxfRead {
  shapes: DxfShape[];
  /** Entity types that were skipped, with how many. */
  skipped: Record<string, number>;
  /** Millimetres per drawing unit, from $INSUNITS (1 when absent or unknown). */
  unit: number;
}

const UNITS: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): { x: number; y: number }[] {
  let span = a1 - a0;
  while (span <= 0) span += 360;
  const n = Math.max(4, Math.ceil(span / 10));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + (span * i) / n) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

export function readDxf(text: string): DxfRead {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1]]);
  const out: DxfRead = { shapes: [], skipped: {}, unit: 1 };
  let inEntities = false;
  let cur: { type: string; g: [number, string][] } | null = null;
  const ents: { type: string; g: [number, string][] }[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [code, v] = pairs[i];
    if (code === 9 && v.trim() === '$INSUNITS' && pairs[i + 1]) out.unit = UNITS[Number(pairs[i + 1][1])] ?? 1;
    if (code === 0 && v.trim() === 'SECTION' && pairs[i + 1]?.[1].trim() === 'ENTITIES') { inEntities = true; continue; }
    if (code === 0 && v.trim() === 'ENDSEC') { inEntities = false; cur = null; continue; }
    if (!inEntities) continue;
    if (code === 0) { cur = { type: v.trim().toUpperCase(), g: [] }; ents.push(cur); } else cur?.g.push([code, v]);
  }
  const num = (e: { g: [number, string][] }, code: number, d = 0) => { const p = e.g.find((x) => x[0] === code); return p ? Number(p[1]) : d; };
  const all = (e: { g: [number, string][] }, code: number) => e.g.filter((x) => x[0] === code).map((x) => Number(x[1]));
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    switch (e.type) {
      case 'LINE': out.shapes.push({ pts: [{ x: num(e, 10), y: num(e, 20) }, { x: num(e, 11), y: num(e, 21) }] }); break;
      case 'LWPOLYLINE': {
        const xs = all(e, 10), ys = all(e, 20);
        const pts = xs.map((x, k) => ({ x, y: ys[k] }));
        if (num(e, 70) & 1 && pts.length) pts.push(pts[0]);
        if (pts.length > 1) out.shapes.push({ pts });
        break;
      }
      case 'POLYLINE': {
        const pts: { x: number; y: number }[] = [];
        while (ents[i + 1] && ents[i + 1].type === 'VERTEX') { i++; pts.push({ x: num(ents[i], 10), y: num(ents[i], 20) }); }
        if (ents[i + 1]?.type === 'SEQEND') i++;
        if (num(e, 70) & 1 && pts.length) pts.push(pts[0]);
        if (pts.length > 1) out.shapes.push({ pts });
        break;
      }
      case 'CIRCLE': out.shapes.push({ pts: arcPts(num(e, 10), num(e, 20), num(e, 40), 0, 360) }); break;
      case 'ARC': out.shapes.push({ pts: arcPts(num(e, 10), num(e, 20), num(e, 40), num(e, 50), num(e, 51, 360)) }); break;
      case 'TEXT':
      case 'MTEXT': {
        const value = e.type === 'MTEXT' ? e.g.filter((x) => x[0] === 3 || x[0] === 1).map((x) => x[1]).join('').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '') : (e.g.find((x) => x[0] === 1)?.[1] ?? '');
        const j = num(e, 72);
        if (value.trim()) out.shapes.push({ text: { x: num(e, 10), y: num(e, 20), h: num(e, 40, 2.5), rot: num(e, 50), value, align: e.type === 'MTEXT' ? 'left' : j === 1 || j === 4 ? 'center' : j === 2 ? 'right' : 'left' } });
        break;
      }
      case 'VERTEX': case 'SEQEND': break;
      default: out.skipped[e.type] = (out.skipped[e.type] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * Plain page graphics from a DXF: lines for every polyline, circle and arc, texts for texts. The
 * drawing is scaled to millimetres, flipped to the page's y-down axis and moved to (x0, y0); when it
 * is larger than maxW x maxH it is scaled down to fit.
 */
export function dxfElements(text: string, newId: () => string, box: { x0: number; y0: number; maxW: number; maxH: number }): { elements: El[]; skipped: Record<string, number>; scale: number } {
  const r = readDxf(text);
  const xs: number[] = [], ys: number[] = [];
  for (const s of r.shapes) {
    for (const p of s.pts ?? []) { xs.push(p.x * r.unit); ys.push(p.y * r.unit); }
    if (s.text) { xs.push(s.text.x * r.unit); ys.push(s.text.y * r.unit); }
  }
  if (xs.length === 0) return { elements: [], skipped: r.skipped, scale: 1 };
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(1, box.maxW / Math.max(1, maxX - minX), box.maxH / Math.max(1, maxY - minY));
  const X = (x: number) => Math.round((box.x0 + (x * r.unit - minX) * scale) * 100) / 100;
  const Y = (y: number) => Math.round((box.y0 + (maxY - y * r.unit) * scale) * 100) / 100;
  const elements: El[] = [];
  for (const s of r.shapes) {
    if (s.pts) elements.push({ id: newId(), kind: 'line', points: s.pts.map((p) => ({ x: X(p.x), y: Y(p.y) })) } as LineEl);
    else if (s.text) {
      const t = s.text;
      elements.push({ id: newId(), kind: 'text', x: X(t.x), y: Y(t.y) - t.h * r.unit * scale * 0.72, rot: ((-t.rot % 360) + 360) % 360, text: t.value, size: Math.max(1, Math.round(t.h * r.unit * scale * 10) / 10), align: t.align } as TextEl);
    }
  }
  return { elements, skipped: r.skipped, scale };
}
