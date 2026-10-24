// Vector PDF export of pages at true scale (CLAUDE.md, rule 11): 1 mm on the sheet is 1 mm in the
// PDF (72 / 25.4 points per millimetre, never rounded). The same display primitives the canvas
// draws are written as PDF paths and text, always on white paper, in the project's drawing style.
// pdf-lib (MIT) does the writing. With the bundled font (Roboto, SIL OFL, shared/fonts) the text is
// embedded as a subset, so it shows in every viewer and renderer; without it (or in the serif and
// mono styles) the standard PDF fonts are used.

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, StandardFonts, type PDFFont, type PDFImage } from 'pdf-lib';
import { buildPage } from './draw/page';
import type { Library } from './library/types';
import type { Asset, Project } from './model/types';
import { sheetMm } from './sheets';

export const MM_TO_PT = 72 / 25.4;

/** The thinnest line drawn: 0.13 mm, the smallest width of the ISO 128-2 series (docs/to-verify.md). */
const MIN_LINE_MM = 0.13;

export interface PdfOptions {
  /** Page ids to export, in order; default all pages. */
  pageIds?: string[];
  /** Turns an SVG asset into PNG bytes (needs a canvas, so the renderer supplies it). */
  rasterizeSvg?: (asset: Asset) => Promise<Uint8Array>;
  /** TrueType bytes of the regular and bold font to embed (the sans style). */
  fonts?: { regular: Uint8Array; bold: Uint8Array };
  creator?: string;
  /** Fixed dates, for byte-identical output in tests. */
  deterministic?: boolean;
}

const SUBS: Record<string, string> = { '−': '-', '–': '-', '—': '-', '’': "'", '‘': "'", '“': '"', '”': '"', 'Ø': 'Ø', '⌀': 'Ø', 'Ω': 'ohm', 'μ': 'µ' };
/** Text as the standard fonts (WinAnsi) can show it. */
export function pdfSafeText(s: string): string {
  return s.replace(/[^\x20-\x7e\xa0-\xff]/g, (ch) => SUBS[ch] ?? '?');
}

function rgbOf(c: string): string {
  const n = parseInt(c.slice(1), 16);
  return `${f(((n >> 16) & 255) / 255)} ${f(((n >> 8) & 255) / 255)} ${f((n & 255) / 255)}`;
}

const f = (n: number) => String(Number(n.toFixed(4)));
function polyOps(pts: number[], closed?: boolean): string {
  let d = '';
  for (let i = 0; i < pts.length; i += 2) d += `${f(pts[i])} ${f(pts[i + 1])} ${i === 0 ? 'm' : 'l'}\n`;
  return d + (closed ? 'h\n' : '');
}
/** Cubic Beziers (at most 90 degrees each) for a clockwise arc; `move` starts a new subpath. */
function arcOps(cx: number, cy: number, r: number, a0: number, a1: number, move = true): string {
  let span = a1 - a0;
  span = ((span % 360) + 360) % 360;
  if (span === 0) span = 360;
  const n = Math.max(1, Math.ceil(span / 90 - 1e-9));
  const th = ((span / n) * Math.PI) / 180;
  const k = (4 / 3) * Math.tan(th / 4) * r;
  let out = '';
  for (let i = 0; i < n; i++) {
    const s = (a0 * Math.PI) / 180 + th * i, e = s + th;
    const p0 = [cx + r * Math.cos(s), cy + r * Math.sin(s)];
    const p3 = [cx + r * Math.cos(e), cy + r * Math.sin(e)];
    if (i === 0 && move) out += `${f(p0[0])} ${f(p0[1])} m\n`;
    out += `${f(p0[0] - k * Math.sin(s))} ${f(p0[1] + k * Math.cos(s))} ${f(p3[0] + k * Math.sin(e))} ${f(p3[1] - k * Math.cos(e))} ${f(p3[0])} ${f(p3[1])} c\n`;
  }
  return out;
}

function b64(data: string): Uint8Array {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function exportPdf(project: Project, lib: Library, opts: PdfOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const family = project.settings.style.font;
  const embedded = !!opts.fonts && family === 'sans';
  let regular: PDFFont, bold: PDFFont;
  if (embedded && opts.fonts) {
    doc.registerFontkit(fontkit);
    regular = await doc.embedFont(opts.fonts.regular, { subset: true });
    bold = await doc.embedFont(opts.fonts.bold, { subset: true });
  } else {
    regular = await doc.embedFont(family === 'serif' ? StandardFonts.TimesRoman : family === 'mono' ? StandardFonts.Courier : StandardFonts.Helvetica);
    bold = await doc.embedFont(family === 'serif' ? StandardFonts.TimesRomanBold : family === 'mono' ? StandardFonts.CourierBold : StandardFonts.HelveticaBold);
  }
  const chars = embedded ? new Set(regular.getCharacterSet()) : null;
  const safe = (s: string): string => {
    if (!chars) return pdfSafeText(s);
    return s.replace(/[^\x20-\x7e]/g, (ch) => (chars.has(ch.codePointAt(0) as number) ? ch : (SUBS[ch] ?? '?')));
  };
  const images = new Map<string, PDFImage | null>();
  const imageFor = async (id: string): Promise<PDFImage | null> => {
    if (images.has(id)) return images.get(id) ?? null;
    const a = project.assets[id];
    let img: PDFImage | null = null;
    try {
      if (a?.mime === 'image/png') img = await doc.embedPng(b64(a.data));
      else if (a?.mime === 'image/jpeg') img = await doc.embedJpg(b64(a.data));
      else if (a?.mime === 'image/svg+xml' && opts.rasterizeSvg) img = await doc.embedPng(await opts.rasterizeSvg(a));
    } catch {
      img = null;
    }
    images.set(id, img);
    return img;
  };

  const ids = opts.pageIds ?? project.pages.map((p) => p.id);
  for (const id of ids) {
    const index = project.pages.findIndex((p) => p.id === id);
    if (index < 0) continue;
    const pg = project.pages[index];
    const { w, h } = sheetMm(pg.size);
    const page = doc.addPage([w * MM_TO_PT, h * MM_TO_PT]);
    page.node.setFontDictionary(PDFName.of('F1'), regular.ref);
    page.node.setFontDictionary(PDFName.of('F2'), bold.ref);
    const built = buildPage(project, pg, lib, index);
    const ops: string[] = [];
    let imageN = 0;
    // Graphics are written in millimetres: the matrix scales to points and flips y (sheet y is down).
    const flip = `${f(MM_TO_PT)} 0 0 ${f(-MM_TO_PT)} 0 ${f(h * MM_TO_PT)} cm`;
    const stroke = (w: number, c: string, fillIt: boolean, dash?: boolean) => `${rgbOf(c)} RG ${fillIt ? `${rgbOf(c)} rg ` : ''}${f(Math.max(w, MIN_LINE_MM))} w ${dash ? '[1.5 1] 0 d' : '[] 0 d'} 1 J 1 j\n`;
    const paint = (fillIt: boolean) => (fillIt ? 'B\n' : 'S\n');
    for (const p of built.prims) {
      switch (p.k) {
        case 'poly': ops.push(`q ${flip}\n${stroke(p.w, p.c, !!p.fill, p.dash)}${polyOps(p.pts, p.closed)}${paint(!!p.fill)}Q\n`); break;
        case 'circle': ops.push(`q ${flip}\n${stroke(p.w, p.c, !!p.fill, p.dash)}${arcOps(p.cx, p.cy, p.r, 0, 360)}h\n${paint(!!p.fill)}Q\n`); break;
        case 'arc': ops.push(`q ${flip}\n${stroke(p.w, p.c, false)}${arcOps(p.cx, p.cy, p.r, p.a0, p.a1)}S\nQ\n`); break;
        case 'text': {
          const font: PDFFont = p.bold ? bold : regular;
          const text = safe(p.text);
          const size = p.size * MM_TO_PT;
          const wpt = font.widthOfTextAtSize(text, size);
          const off = p.anchor === 'start' ? 0 : p.anchor === 'middle' ? wpt / 2 : wpt;
          const phi = (-p.rot * Math.PI) / 180;
          // Baseline start point in points, y up; the text matrix rotates counter-clockwise by phi.
          const a = (p.rot * Math.PI) / 180;
          const x = p.x * MM_TO_PT - Math.cos(a) * off, y = (h - p.y) * MM_TO_PT + Math.sin(a) * off;
          ops.push(`q BT ${rgbOf(p.c)} rg /${p.bold ? 'F2' : 'F1'} ${f(size)} Tf ${f(Math.cos(phi))} ${f(Math.sin(phi))} ${f(-Math.sin(phi))} ${f(Math.cos(phi))} ${f(x)} ${f(y)} Tm ${font.encodeText(text).toString()} Tj ET Q\n`);
          break;
        }
        case 'image': {
          const img = await imageFor(p.assetId);
          if (img) {
            const name = `I${++imageN}`;
            page.node.setXObject(PDFName.of(name), img.ref);
            ops.push(`q ${f(p.w * MM_TO_PT)} 0 0 ${f(p.h * MM_TO_PT)} ${f(p.x * MM_TO_PT)} ${f((h - p.y - p.h) * MM_TO_PT)} cm /${name} Do Q\n`);
          } else ops.push(`q ${flip}\n${stroke(0.2, '#999999', false)}${polyOps([p.x, p.y, p.x + p.w, p.y, p.x + p.w, p.y + p.h, p.x, p.y + p.h], true)}S\nQ\n`);
          break;
        }
      }
    }
    page.node.addContentStream(doc.context.register(doc.context.stream(ops.join(''))));
  }
  doc.setTitle(`${project.name}`);
  doc.setProducer('CablePilot');
  doc.setCreator(opts.creator ?? 'CablePilot');
  if (opts.deterministic) {
    const d = new Date(Date.UTC(2000, 0, 1));
    doc.setCreationDate(d);
    doc.setModificationDate(d);
  }
  return doc.save({ useObjectStreams: !opts.deterministic });
}
