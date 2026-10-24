// Sizing (rule 12): "size the whole project" as a review table, and the suggestion panel per line. Everything is
// computed from the schematic, the load data and the supply data (shared/feeders.ts, shared/sizing.ts); parts come
// from the library and are ranked by what the warehouse has for this project. Confirming a line, or all of them, is
// one undoable command. Each result shows its requirement, its assumptions, which table values are unverified, and says
// it does not replace the engineer's verification.
import { Fragment, useMemo, useState } from 'react';
import { t, getLanguage } from '@shared/i18n';
import { computeBom } from '@shared/bom';
import { acceptAllCommand, lineCommands, sizeProject, SIZING_NOTE, type Feeder, type Line, type LineRole, type LineStatus } from '@shared/feeders';
import type { Availability, Option } from '@shared/stock';
import { isStale } from '@shared/stock';
import { useEditor } from '../state/editor';
import { today, useStock } from '../state/stock';
import { Modal } from './Modal';

const ROLE: Record<LineRole, () => string> = { breaker: () => t('Breaker'), contactor: () => t('Contactor'), overload: () => t('Overload relay'), cable: () => t('Cable'), wires: () => t('Wires') };
const STATUS: Record<LineStatus, () => string> = { ok: () => t('meets the requirement'), change: () => t('change proposed'), unavailable: () => t('nothing meets it'), missing: () => t('data missing') };
const AVAIL: Record<Availability, () => string> = { enough: () => t('in stock'), short: () => t('in stock, but short'), none: () => t('not in stock') };
const FIELD: Record<string, () => string> = { powerKw: () => t('power'), cosPhi: () => t('cos φ'), efficiency: () => t('efficiency'), current: () => t('current'), installationMethod: () => t('installation method') };

function OptionRows({ o }: { o: Option }) {
  if (!o.stock) return <span className="hint">{t('Not in the stock list')}</span>;
  return (
    <ul className="stock-rows">
      {o.stock.rows.map((r, i) => (
        <li key={i}>
          <span>{r.item.warehouse || '-'}</span> <span className="mono">{r.item.location || '-'}</span>
          <span> · {t('on hand')} {r.item.onHand}, {t('reserved')} {r.item.reserved}, </span>
          <strong data-testid="stock-available">{t('available for this project')} {r.available} {r.item.unit}</strong>
        </li>
      ))}
    </ul>
  );
}

function Panel({ feeder, line, onDone }: { feeder: Feeder; line: Line; onDone: () => void }) {
  const lang = getLanguage();
  const [pick, setPick] = useState(0);
  const ctx = useCtx();
  const exec = useEditor.getState().exec;
  const opt = line.options[pick];
  const confirm = () => {
    const cmd = lineCommands(ctx, line, opt, feeder.ib);
    if (cmd) exec(cmd);
    onDone();
  };
  return (
    <div className="sizing-panel" data-testid="sizing-panel">
      {line.requirement && (
        <>
          <p><strong>{t('Requirement')}:</strong> {line.requirement.text}</p>
          <ul className="assumptions">{line.requirement.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          {line.requirement.unverified.length > 0 && <p className="hint warn" data-testid="sizing-unverified">{t('Unverified table values: {list}. See docs/to-verify.md.', { list: line.requirement.unverified.join('; ') })}</p>}
        </>
      )}
      {line.cable && line.cable.xs !== undefined && (
        <p className="hint">{t('Iz {iz} A = table {table} A × ambient {kT} × grouping {kG}', { iz: line.cable.iz ?? 0, table: line.cable.table ?? 0, kT: line.cable.kT ?? 1, kG: line.cable.kG ?? 1 })}{line.cable.drop ? ` · ${t('voltage drop {v} V ({p} %)', { v: line.cable.drop.volts, p: line.cable.drop.percent })}` : ''}</p>
      )}
      {line.role === 'wires' ? (
        line.proposal?.xs && <div className="row-buttons"><button type="button" data-testid="sizing-confirm" onClick={confirm}>{t('Give the wires {xs} mm²', { xs: line.proposal.xs })}</button></div>
      ) : (
        <>
          {line.options.length === 0 && <p className="hint warn">{t('No library part meets this requirement.')}</p>}
          <table className="bom" data-testid="sizing-options">
            <thead><tr><th scope="col" /><th scope="col">{t('Part')}</th><th scope="col">{t('Availability')}</th><th scope="col">{t('Warehouse and quantity')}</th></tr></thead>
            <tbody>
              {line.options.map((o, i) => (
                <tr key={o.part.id} className={i === pick ? 'chosen' : ''}>
                  <td><input type="radio" name="sizing-pick" aria-label={o.part.code} data-testid={`sizing-pick-${i}`} checked={i === pick} onChange={() => setPick(i)} /></td>
                  <td><span className="mono">{o.part.code}</span> <span className="hint">{o.part.title[lang]}{o.part.verification !== 'primary' ? ` · ${t('generic data')}` : ''}</span></td>
                  <td><span className={`badge ${o.availability === 'enough' ? 'ok' : 'warn'}`}>{AVAIL[o.availability]()}</span></td>
                  <td><OptionRows o={o} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row-buttons">
            <button type="button" data-testid="sizing-confirm" disabled={!opt} onClick={confirm}>{t('Assign {code}', { code: opt?.part.code ?? '' })}</button>
          </div>
        </>
      )}
      <p className="hint">{SIZING_NOTE()}</p>
    </div>
  );
}

function useCtx() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const stock = useStock((s) => s.stock);
  return useMemo(() => ({ project, lib, stock, bom: computeBom(project, lib) }), [project, lib, stock]);
}

export function SizingDialog() {
  const ctx = useCtx();
  const focus = useEditor((s) => s.sizingFocus);
  const st = useEditor.getState();
  const [open, setOpen] = useState<string | null>(null);
  const feeders = useMemo(() => sizeProject(ctx), [ctx]);
  const shown = focus ? feeders.filter((f) => f.load === focus || f.lines.some((l) => l.subject === focus)) : feeders;
  const s = ctx.project.settings;
  const sup = s.supply;
  const all = useMemo(() => acceptAllCommand(ctx, shown), [ctx, shown]);
  const changes = shown.flatMap((f) => f.lines).filter((l) => l.status === 'change').length;
  const stale = ctx.stock ? isStale(ctx.stock, today()) : false;
  return (
    <Modal title={focus ? t('Sizing: {device}', { device: focus }) : t('Size the whole project')} wide onClose={() => st.setDialog(null)}>
      <p className="hint" data-testid="sizing-note">{t('Computed from the schematic, the load data and the supply data. Nothing changes until you confirm.')} {SIZING_NOTE()}</p>
      <p className="hint" data-testid="sizing-supply">
        {t('Supply: {v} V, Ik {ik}, method {m}, {a} °C, grouping {g}, voltage drop up to {d} %.', { v: sup.voltage, ik: sup.ik > 0 ? `${sup.ik} kA` : t('not stated'), m: s.installationMethod || t('not stated'), a: sup.ambient, g: sup.grouping, d: sup.maxDropPct })}{' '}
        <button type="button" className="link" onClick={() => st.setDialog('settings')}>{t('Change in project settings')}</button>
      </p>
      <div className="bom-controls">
        <button type="button" data-testid="sizing-accept-all" disabled={!all} onClick={() => { if (all) st.exec(all); }}>{t('Accept all proposals')} ({changes})</button>
        {focus && <button type="button" onClick={() => st.patch({ sizingFocus: null })}>{t('Show every feeder')}</button>}
        <button type="button" onClick={() => st.setDialog('warehouse')}>{t('Warehouse')}</button>
        {ctx.stock ? <span className="hint" data-testid="sizing-stock">{t('Stock list of {date}', { date: ctx.stock.stockDate })}{stale && <> <span className="badge warn">{t('Stock list is old')}</span></>}</span> : <span className="hint warn" data-testid="sizing-no-stock">{t('No stock list: parts are ranked as not in stock. Load one in the warehouse.')}</span>}
      </div>
      {shown.length === 0 && <p className="hint">{t('No loads yet. Give a motor or another load its data in the device properties.')}</p>}
      {shown.map((f) => (
        <section key={f.load} className="feeder" data-testid="sizing-feeder">
          <h3>{f.load}{f.ib !== undefined && <span className="hint"> · Ib {Math.round(f.ib * 10) / 10} A ({f.ibSource === 'nameplate' ? t('nameplate') : t('computed')}){f.length ? ` · ${f.length.metres} m` : ''}</span>}</h3>
          {f.missing.length > 0 && <p className="hint warn" data-testid="sizing-missing">{t('Data missing: {list}. Enter it in the properties of the device.', { list: f.missing.map((m) => FIELD[m]?.() ?? m).join(', ') })}</p>}
          {f.lines.length > 0 && (
            <table className="bom sizing" data-testid="sizing-table">
              <thead><tr><th scope="col">{t('Item')}</th><th scope="col">{t('Requirement')}</th><th scope="col">{t('Now')}</th><th scope="col">{t('Result')}</th><th scope="col">{t('Proposal')}</th><th scope="col" /></tr></thead>
              <tbody>
                {f.lines.map((l) => {
                  const o = l.proposal?.option;
                  const isOpen = open === l.id;
                  return (
                    <Fragment key={l.id}>
                      <tr data-testid="sizing-line" data-status={l.status} data-role={l.role}>
                        <td>{ROLE[l.role]()} {l.subject}</td>
                        <td>{l.requirement?.text ?? (l.missing.length ? l.missing.map((m) => FIELD[m]?.() ?? m).join(', ') : '')}</td>
                        <td>{l.current?.label || '-'}{l.current && l.current.reasons.length > 0 && <div className="hint warn">{l.current.reasons.join('; ')}</div>}</td>
                        <td><span className={`badge ${l.status === 'ok' ? 'ok' : 'warn'}`}>{STATUS[l.status]()}</span></td>
                        <td>
                          {o ? <><span className="mono">{o.part.code}</span><div className="hint">{AVAIL[o.availability]()}{o.stock?.rows[0] ? ` · ${o.stock.rows[0].item.warehouse} ${o.stock.rows[0].item.location} · ${t('available for this project')} ${o.stock.available} ${o.stock.unit}` : ''}</div></>
                            : l.proposal?.xs ? `${l.proposal.xs} mm²` : ''}
                        </td>
                        <td className="actions-cell">
                          {l.status === 'change' && <button type="button" data-testid="sizing-accept" onClick={() => { const cmd = lineCommands(ctx, l, undefined, f.ib); if (cmd) st.exec(cmd); }}>{t('Accept')}</button>}{' '}
                          {(l.options.length > 0 || l.status === 'change' || l.requirement) && <button type="button" data-testid="sizing-choose" onClick={() => setOpen(isOpen ? null : l.id)}>{isOpen ? t('Close') : t('Suggestions')}</button>}
                        </td>
                      </tr>
                      {isOpen && <tr><td colSpan={6}><Panel feeder={f} line={l} onDone={() => setOpen(null)} /></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ))}
      <p className="hint">{t('Cables and wires are sized for the breaker\'s rated current. A part that has no technical data is never suggested.')}</p>
    </Modal>
  );
}
