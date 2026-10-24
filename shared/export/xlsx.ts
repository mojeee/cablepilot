// XLSX writer (and a reader for our own files): the Office Open XML workbook is a ZIP of a few XML
// parts, which we write directly (shared/export/zip.ts), so there is no dependency. Cells are
// inline strings, or numbers when the text is a plain number without a leading zero (wire number
// "001" stays text). The header row is bold.

import { zipRead, zipStore } from './zip';

export interface Sheet {
  name: string;
  rows: string[][];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const col = (i: number): string => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const isNum = (s: string) => /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s);

/** Sheet names: at most 31 characters, none of []:*?/\ , unique. */
export function sheetNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((n) => {
    let base = n.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let k = 2;
    while (seen.has(base.toLowerCase())) base = `${base.slice(0, 28)} ${k++}`;
    seen.add(base.toLowerCase());
    return base;
  });
}

export function xlsxBytes(sheets: Sheet[]): Uint8Array {
  const names = sheetNames(sheets.map((s) => s.name));
  const parts: { name: string; data: string }[] = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>' },
  ];
  sheets.forEach((s, si) => {
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      if (v === '') return '';
      const ref = `${col(ci)}${ri + 1}`, style = ri === 0 ? ' s="1"' : '';
      return isNum(v) && ri > 0 ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    parts.push({ name: `xl/worksheets/sheet${si + 1}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>` });
  });
  return zipStore(parts);
}

/** Reads a workbook written by xlsxBytes (inline strings and numbers): for tests and re-import of our own files. */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = zipRead(bytes);
  const wb = files.get('xl/workbook.xml') ?? '';
  const names = [...wb.matchAll(/<sheet name="([^"]*)"/g)].map((m) => unesc(m[1]));
  return names.map((name, i) => {
    const xml = files.get(`xl/worksheets/sheet${i + 1}.xml`) ?? '';
    const rows: string[][] = [];
    for (const rm of xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)) {
      const row: string[] = [];
      for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>(.*?)<\/c>)/g)) {
        let ci = 0;
        for (const ch of cm[1]) ci = ci * 26 + (ch.charCodeAt(0) - 64);
        const body = cm[2] ?? '';
        const t = /<t[^>]*>(.*?)<\/t>/.exec(body), v = /<v>(.*?)<\/v>/.exec(body);
        row[ci - 1] = t ? unesc(t[1]) : v ? v[1] : '';
      }
      for (let k = 0; k < row.length; k++) row[k] ??= '';
      rows[Number(rm[1]) - 1] = row;
    }
    return { name, rows: Array.from(rows, (r) => r ?? []) };
  });
}
