// Reads the first sheet of an XLSX workbook written by any tool (Excel, LibreOffice, an ERP export): the ZIP
// central directory, deflate or stored entries, shared strings, inline strings and numbers. Used for the
// warehouse import (shared/stock.ts), in the main process, where node:zlib provides `inflate`; the unit tests
// pass the same function. No dependency. Dates and formulas come back as the cached value text.

export type Inflate = (raw: Uint8Array) => Uint8Array;

const dec = new TextDecoder();
const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);

/** The entries of a ZIP as text, by name; throws on a damaged file or an unsupported compression method. */
export function zipEntries(bytes: Uint8Array, inflate: Inflate, want: (name: string) => boolean): Map<string, string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && u32(v, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a ZIP file');
  const count = u16(v, e + 10);
  let p = u32(v, e + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (u32(v, p) !== 0x02014b50) throw new Error('damaged ZIP directory');
    const method = u16(v, p + 10), csize = u32(v, p + 20), nlen = u16(v, p + 28), xlen = u16(v, p + 30), clen = u16(v, p + 32), off = u32(v, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!want(name)) continue;
    const start = off + 30 + u16(v, off + 26) + u16(v, off + 28);
    const raw = bytes.subarray(start, start + csize);
    if (method === 0) out.set(name, dec.decode(raw));
    else if (method === 8) out.set(name, dec.decode(inflate(raw)));
    else throw new Error(`unsupported ZIP compression ${method}`);
  }
  return out;
}

const unesc = (s: string): string =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml: string): string => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join('');
const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? '') n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** The rows of the first worksheet as text cells (empty string for an empty cell). */
export function readXlsxRows(bytes: Uint8Array, inflate: Inflate): string[][] {
  const files = zipEntries(bytes, inflate, (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheetName = [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]))[0];
  if (!sheetName) throw new Error('the workbook has no sheet');
  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rows: string[][] = [];
  let next = 0;
  for (const rm of (files.get(sheetName) as string).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rn = /\br="(\d+)"/.exec(rm[1]);
    const ri = rn ? Number(rn[1]) - 1 : next;
    next = ri + 1;
    const row: string[] = [];
    let ci = 0;
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cm[1]);
      if (ref) ci = colIndex(ref[1]);
      const type = /\bt="(\w+)"/.exec(cm[1])?.[1];
      const body = cm[2] ?? '';
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      row[ci] = type === 's' ? (shared[Number(v)] ?? '') : type === 'inlineStr' ? textOf(body) : v !== undefined ? unesc(v) : '';
      ci++;
    }
    for (let k = 0; k < row.length; k++) row[k] ??= '';
    while (rows.length < ri) rows.push([]);
    rows[ri] = row;
  }
  return rows;
}
