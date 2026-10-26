// Escaping helper shared by the site build, and a small Markdown renderer for the docs pages: headings (with ids for
// anchors), paragraphs, "- " and "1. " lists with indented continuation lines, tables, fenced code, and inline `code`,
// **bold**, [links](url) and <https://autolinks>. Everything is escaped first; no raw HTML passes through.
export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** An id for a heading: lower case, letters and digits joined by dashes (accents dropped). */
export const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/`|\*\*/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Inline Markdown on one line of text; `link` maps each link target (relative .md links become site pages). */
export function inlineMd(text, link = (href) => href) {
  const codes = [];
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_m, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => `<a href="${escapeHtml(link(href.replace(/&amp;/g, '&')))}">${label}</a>`)
    .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_m, url) => `<a href="${url}">${url}</a>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)]}</code>`);
}

/** Markdown to HTML. Returns the first "# " heading as `title` and the rest as `html`; `link` maps link targets. */
export function renderMarkdown(src, { link } = {}) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const toc = [];
  let title = '';
  let i = 0;
  const inline = (t) => inlineMd(t, link);
  const isBlockStart = (l) => /^(#{1,6} |- |\d+\. |\||```)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,6}) (.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      if (level === 1 && !title) title = text;
      else {
        const id = slugify(text);
        if (level === 2) toc.push({ id, text });
        out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      }
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<div class="table-wrap"><table><thead><tr>${cells(head).map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const li = /^(- |(\d+)\. )(.*)$/.exec(line);
    if (li) {
      const ordered = !!li[2];
      const items = [];
      while (i < lines.length) {
        const m = /^(- |(\d+)\. )(.*)$/.exec(lines[i]);
        if (m && !!m[2] === ordered) { items.push(m[3]); i++; continue; }
        // An indented line continues the current item.
        if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += ` ${lines[i].trim()}`; i++; continue; }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { title, html: out.join('\n'), toc };
}
