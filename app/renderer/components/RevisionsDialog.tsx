// Revisions and issue status (M4): the status of the set, issuing a revision (the app works out which
// pages changed since the last one), the issued revisions, and the comparison of two revisions with
// changed pages highlighted and the added, removed and changed devices, wires and parts.
import { useMemo, useState } from 'react';
import { t } from '@shared/i18n';
import { ISSUE_STATUSES, type IssueStatus } from '@shared/model/types';
import { changedPages, compareRevisions, nextRevisionNumber, type ItemChange } from '@shared/revisions';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';
import { Select, TextField } from './fields';
import { Modal } from './Modal';

export function statusLabel(s: IssueStatus): string {
  switch (s) {
    case 'proposal': return t('For proposal');
    case 'approval': return t('For approval');
    case 'construction': return t('For construction');
    case 'asBuilt': return t('As built');
  }
}
const changeLabel = (s: 'added' | 'removed' | 'changed'): string => (s === 'added' ? t('added') : s === 'removed' ? t('removed') : t('changed'));

function ChangeList({ title, items, testid }: { title: string; items: { key: string; status: 'added' | 'removed' | 'changed'; extra?: string }[]; testid: string }) {
  return (
    <div className="rev-list" data-testid={testid}>
      <h4>{title} ({items.length})</h4>
      <ul>{items.slice(0, 200).map((i) => <li key={i.key} className={`rev-${i.status}`}>{i.key}: {changeLabel(i.status)}{i.extra ? ` (${i.extra})` : ''}</li>)}</ul>
    </div>
  );
}
const items = (c: ItemChange[]) => c.map((x) => ({ key: x.key, status: x.status, extra: x.from !== undefined || x.to !== undefined ? t('{from} to {to}', { from: x.from ?? 0, to: x.to ?? 0 }) : undefined }));

export function RevisionsDialog() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const st = useEditor.getState();
  const changed = useMemo(() => changedPages(project, lib), [project, lib]);
  const revs = project.revisions;
  const last = revs[revs.length - 1];
  const next = nextRevisionNumber(project);
  const [form, setForm] = useState({ number: '', date: new Date().toISOString().slice(0, 10), description: '', drawn: project.properties.drawn ?? '', checked: project.properties.checked ?? '', approved: project.properties.approved ?? '' });
  const number = form.number || next;
  const initFrom = revs[Math.max(0, revs.length - 2)]?.number ?? '';
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initFrom === last?.number ? 'working' : (last?.number ?? 'working'));
  const cmp = useMemo(() => (from && to && from !== to ? compareRevisions(project, lib, from, to) : undefined), [project, lib, from, to]);
  const opts = [...revs.map((r) => ({ value: r.number, label: t('Revision {n}', { n: r.number }) })), { value: 'working', label: t('Working copy') }];
  const issue = () => {
    st.exec({ type: 'revision/issue', revision: { number, date: form.date, description: form.description, drawn: form.drawn, checked: form.checked, approved: form.approved, status: project.issueStatus } });
    st.setDialog(null);
    const pages = useEditor.getState().project().pages.length;
    useUi.getState().addMessage('info', () => t('Revision {n} issued: {pages} pages recorded.', { n: number, pages }));
  };
  return (
    <Modal title={t('Revisions and issue status')} wide onClose={() => st.setDialog(null)}>
      <Select<IssueStatus> label={t('Issue status of the set')} testid="issue-status" value={project.issueStatus} options={ISSUE_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} onChange={(v) => st.exec({ type: 'issue/status', status: v })} />

      <h3>{t('Issue a revision')}</h3>
      <div className="rev-form">
        <TextField label={t('Number')} testid="rev-number" value={number} onCommit={(v) => setForm({ ...form, number: v })} />
        <TextField label={t('Date')} testid="rev-date" value={form.date} onCommit={(v) => setForm({ ...form, date: v })} />
        <TextField label={t('Description')} testid="rev-description" value={form.description} onCommit={(v) => setForm({ ...form, description: v })} />
        <TextField label={t('Drawn by')} testid="rev-drawn" value={form.drawn} onCommit={(v) => setForm({ ...form, drawn: v })} />
        <TextField label={t('Checked by')} testid="rev-checked" value={form.checked} onCommit={(v) => setForm({ ...form, checked: v })} />
        <TextField label={t('Approved by')} testid="rev-approved" value={form.approved} onCommit={(v) => setForm({ ...form, approved: v })} />
      </div>
      <p className="hint">{t('Date and names are saved in the title block.')}</p>
      {last ? <h4>{t('Pages changed since revision {n}', { n: last.number })} ({changed.length})</h4> : null}
      {last && changed.length === 0 && <p className="hint">{t('No page has changed since the last issued revision.')}</p>}
      {last && changed.length > 0 && <ul data-testid="changed-pages">{changed.map((c) => <li key={c.id} className={`rev-${c.status}`}>{c.title}: {changeLabel(c.status)}</li>)}</ul>}
      {!last && <p className="hint">{t('No revision has been issued yet. The first one records the state of every page.')}</p>}
      <div className="bom-controls">
        <button type="button" data-testid="issue-revision" onClick={issue}>{t('Issue revision {n}', { n: number })}</button>
      </div>

      <h3>{t('Issued revisions')}</h3>
      <table className="bom" data-testid="revision-table">
        <thead><tr><th scope="col">{t('Number')}</th><th scope="col">{t('Date')}</th><th scope="col">{t('Description')}</th><th scope="col">{t('Drawn by')}</th><th scope="col">{t('Checked by')}</th><th scope="col">{t('Approved by')}</th><th scope="col">{t('Issue status of the set')}</th></tr></thead>
        <tbody>{revs.map((r) => <tr key={r.number}><td>{r.number}</td><td>{r.date}</td><td>{r.description}</td><td>{r.drawn}</td><td>{r.checked}</td><td>{r.approved}</td><td>{statusLabel(r.status)}</td></tr>)}</tbody>
      </table>

      {revs.length > 0 && (
        <>
          <h3>{t('Compare revisions')}</h3>
          <div className="bom-controls">
            <Select label={t('From')} testid="cmp-from" value={from} options={opts.filter((o) => o.value !== 'working')} onChange={setFrom} />
            <Select label={t('To')} testid="cmp-to" value={to} options={opts} onChange={setTo} />
          </div>
          {cmp && [cmp.pages, cmp.devices, cmp.wires, cmp.parts].every((c) => c.length === 0) && <p className="hint">{t('Nothing differs.')}</p>}
          {cmp && (
            <div className="rev-compare" data-testid="compare">
              <ChangeList title={t('Pages')} testid="cmp-pages" items={cmp.pages.map((p) => ({ key: p.title, status: p.status }))} />
              <ChangeList title={t('Devices')} testid="cmp-devices" items={items(cmp.devices)} />
              <ChangeList title={t('Wires')} testid="cmp-wires" items={items(cmp.wires)} />
              <ChangeList title={t('Parts')} testid="cmp-parts" items={items(cmp.parts)} />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
