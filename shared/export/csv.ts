// CSV of a table: UTF-8 with a byte order mark so spreadsheets open it correctly; ";" for Italian
// (where "," is the decimal mark), "," otherwise.

import type { Lang } from '../i18n';

export function toCsv(rows: string[][], lang: Lang): string {
  const sep = lang === 'it' ? ';' : ',';
  const q = (s: string) => (/["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return `﻿${rows.map((r) => r.map(q).join(sep)).join('\r\n')}\r\n`;
}

/** Reads CSV text written by toCsv (either separator, quoted cells, optional byte order mark). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const sep = src.split('\n')[0].includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
