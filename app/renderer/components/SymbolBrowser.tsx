import { useMemo, useState } from 'react';
import { t, getLanguage } from '@shared/i18n';
import { graphicsFor } from '@shared/draw/symbol';
import type { Gfx, SymbolCategory, SymbolDef } from '@shared/library/types';
import { SYMBOL_CATEGORIES } from '@shared/library/types';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';

export function categoryLabel(c: string): string {
  switch (c as SymbolCategory) {
    case 'power': return t('Power');
    case 'switching': return t('Switching devices');
    case 'protection': return t('Protection');
    case 'contacts': return t('Contacts');
    case 'coils': return t('Coils');
    case 'machines': return t('Machines');
    case 'signalling': return t('Signalling and measuring');
    case 'sources': return t('Sources and transformers');
    case 'electronics': return t('Electronics and converters');
    case 'terminals': return t('Terminals and connectors');
    case 'plc': return t('PLC and I/O');
    case 'potentials': return t('Potentials and earth');
    default: return c;
  }
}

/** An inline SVG of a symbol's graphics, for the browser list and the symbol editor. */
export function SymbolSvg({ gfx, size = 40 }: { gfx: Gfx[]; size?: number }) {
  const pad = 3;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const g of gfx) {
    if (g.t === 'line') { grow(g.x1, g.y1); grow(g.x2, g.y2); }
    else if (g.t === 'poly') for (let i = 0; i < g.pts.length; i += 2) grow(g.pts[i], g.pts[i + 1]);
    else if (g.t === 'rect') { grow(g.x, g.y); grow(g.x + g.w, g.y + g.h); }
    else if (g.t === 'circle' || g.t === 'arc') { grow(g.cx - g.r, g.cy - g.r); grow(g.cx + g.r, g.cy + g.r); }
    else grow(g.x, g.y);
  }
  if (!isFinite(x0)) { x0 = y0 = -5; x1 = y1 = 5; }
  const w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
  const rad = (a: number) => (a * Math.PI) / 180;
  return (
    <svg width={size} height={size} viewBox={`${x0 - pad} ${y0 - pad} ${w} ${h}`} fill="none" stroke="currentColor" strokeWidth={0.5} strokeLinecap="round" aria-hidden="true">
      {gfx.map((g, i) => {
        const dash = 'dash' in g && g.dash ? '1.5 1' : undefined;
        switch (g.t) {
          case 'line': return <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} strokeDasharray={dash} />;
          case 'poly': return g.closed || g.fill ? <polygon key={i} points={g.pts.join(' ')} fill={g.fill ? 'currentColor' : 'none'} strokeDasharray={dash} /> : <polyline key={i} points={g.pts.join(' ')} strokeDasharray={dash} />;
          case 'rect': return <rect key={i} x={g.x} y={g.y} width={g.w} height={g.h} fill={g.fill ? 'currentColor' : 'none'} />;
          case 'circle': return <circle key={i} cx={g.cx} cy={g.cy} r={g.r} fill={g.fill ? 'currentColor' : 'none'} />;
          case 'arc': {
            let e = g.a1;
            while (e <= g.a0) e += 360;
            const sx = g.cx + g.r * Math.cos(rad(g.a0)), sy = g.cy + g.r * Math.sin(rad(g.a0));
            const ex = g.cx + g.r * Math.cos(rad(e)), ey = g.cy + g.r * Math.sin(rad(e));
            return <path key={i} d={`M${sx} ${sy} A${g.r} ${g.r} 0 ${e - g.a0 > 180 ? 1 : 0} 1 ${ex} ${ey}`} />;
          }
          case 'text': return <text key={i} x={g.x} y={g.y + g.size * 0.36} fontSize={g.size} textAnchor={g.anchor ?? 'middle'} fill="currentColor" stroke="none">{g.text.replace('{value}', 'A0.0')}</text>;
        }
      })}
    </svg>
  );
}

export function SymbolBrowser() {
  const lib = useEditor((s) => s.lib);
  const placing = useEditor((s) => s.placing);
  const standard = useEditor((s) => s.history.present.settings.symbolStandard);
  const company = useEditor((s) => s.companySymbols);
  const macros = useEditor((s) => s.macros);
  const [query, setQuery] = useState('');
  useUi((s) => s.language);
  const lang = getLanguage();
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...lib.symbols.values()].filter((d) => !q || d.title[lang].toLowerCase().includes(q) || d.title.en.toLowerCase().includes(q) || d.id.includes(q) || d.function.includes(q) || (d.designationLetter ?? '').toLowerCase() === q);
    const order: string[] = [...SYMBOL_CATEGORIES];
    for (const d of all) if (!order.includes(d.category)) order.push(d.category);
    return order.map((c) => ({ c, items: all.filter((d) => d.category === c).sort((a, b) => a.title[lang].localeCompare(b.title[lang])) })).filter((g) => g.items.length);
  }, [lib, query, lang]);
  const isCompany = (d: SymbolDef) => company.some((c) => c.id === d.id);
  return (
    <aside className="panel browser" aria-label={t('Symbols and devices')}>
      <h2>{t('Symbols and devices')}</h2>
      <input type="search" data-testid="symbol-search" aria-label={t('Search symbols and devices')} placeholder={t('Search symbols and devices')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <button type="button" className="wide" onClick={() => useEditor.getState().setDialog('symbolEditor')}>{t('Symbol editor...')}</button>
      {groups.length === 0 && <p className="hint">{t('No symbol matches your search.')}</p>}
      <section>
        <h3>{t('Boxes and connectors')}</h3>
        <ul className="symbols">
          {([['blackbox', t('Black box'), [{ t: 'rect', x: -6, y: -4, w: 12, h: 8 }]], ['connector', t('Connector'), [{ t: 'rect', x: -3, y: -5, w: 6, h: 10 }, { t: 'circle', cx: 3, cy: -2.5, r: 0.8, fill: true }, { t: 'circle', cx: 3, cy: 0, r: 0.8, fill: true }, { t: 'circle', cx: 3, cy: 2.5, r: 0.8, fill: true }]]] as [string, string, Gfx[]][])
            .filter(([, label]) => !query.trim() || label.toLowerCase().includes(query.trim().toLowerCase()))
            .map(([id, label, gfx]) => (
              <li key={id}>
                <button type="button" data-testid={`symbol-box-${id}`} className={placing === `box:${id}` ? 'sym on' : 'sym'} title={label} onClick={() => useEditor.getState().setTool('symbol', `box:${id}`)}>
                  <SymbolSvg gfx={gfx} />
                  <span>{label}</span>
                </button>
              </li>
            ))}
        </ul>
      </section>
      {macros.length > 0 && (
        <section>
          <h3>{t('Macros')}</h3>
          <ul className="symbols">
            {macros.filter((m) => !query.trim() || m.title[lang].toLowerCase().includes(query.trim().toLowerCase())).map((m) => (
              <li key={m.id}>
                <button type="button" data-testid={`macro-${m.id}`} className={placing === `macro:${m.id}` ? 'sym on' : 'sym'} title={`${m.title[lang]} (${m.source})`} onClick={() => useEditor.getState().setTool('symbol', `macro:${m.id}`)}>
                  <SymbolSvg gfx={[{ t: 'rect', x: -6, y: -4, w: 12, h: 8, fill: false }, { t: 'line', x1: -6, y1: 0, x2: 6, y2: 0, dash: true }]} />
                  <span>{m.title[lang]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.c}>
          <h3>{categoryLabel(g.c)}</h3>
          <ul className="symbols">
            {g.items.map((d) => (
              <li key={d.id}>
                <button type="button" data-testid={`symbol-${d.id}`} className={placing === d.id ? 'sym on' : 'sym'} title={`${d.title[lang]} (${d.source})`} onClick={() => useEditor.getState().setTool('symbol', d.id)}>
                  <SymbolSvg gfx={graphicsFor(d, standard)} />
                  <span>{d.title[lang]}{isCompany(d) ? ` · ${t('company')}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
