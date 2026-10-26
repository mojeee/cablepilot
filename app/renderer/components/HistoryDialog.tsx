// Project history (M8 part 2): the daily backups the app keeps and the versions the user saves with a name. A version
// can be compared with the working copy (pages, devices, wires and parts, as for revisions) and restored as one
// undoable step. The files live in the app's data folder (app/main/history.ts); the renderer gets entries and text.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '@shared/i18n';
import type { HistoryEntry } from '@shared/api';
import { parseProject, serializeProject } from '@shared/file';
import type { Project } from '@shared/model/types';
import { compareSnapshots, makeSnapshot } from '@shared/revisions';
import { useEditor } from '../state/editor';
import { useUi } from '../state/ui';
import { ChangeList, changeItems } from './RevisionsDialog';
import { Modal } from './Modal';

const flash = (severity: 'info' | 'error', text: () => string) => useUi.getState().addMessage(severity, text);
const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

export function HistoryDialog() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<{ entry: HistoryEntry; project: Project } | null>(null);
  const close = () => useEditor.getState().setDialog(null);
  const reload = useCallback(async () => {
    const r = await window.cablepilot.history.list(project.id);
    if (r.ok) setEntries(r.value);
    else flash('error', () => `${r.error.message} ${r.error.hint}`);
  }, [project.id]);
  useEffect(() => { void reload(); }, [reload]);

  const save = async () => {
    const r = await window.cablepilot.history.saveVersion(project.id, name, serializeProject(project));
    if (!r.ok) return flash('error', () => `${r.error.message} ${r.error.hint}`);
    setName('');
    flash('info', () => t('Version "{name}" saved.', { name: r.value.name }));
    await reload();
  };
  const load = async (entry: HistoryEntry) => {
    const r = await window.cablepilot.history.read(project.id, entry.id);
    if (!r.ok) return flash('error', () => `${r.error.message} ${r.error.hint}`);
    const p = parseProject(r.value);
    if (!p.ok) return flash('error', () => `${p.error.message} ${p.error.hint}`);
    setOpen({ entry, project: p.value });
  };
  const restore = () => {
    if (!open) return;
    useEditor.getState().exec({ type: 'project/replace', project: open.project });
    flash('info', () => t('Restored {name}. Undo (Ctrl+Z) brings back what you had.', { name: label(open.entry) }));
    close();
  };
  const remove = async (entry: HistoryEntry) => {
    const r = await window.cablepilot.history.remove(project.id, entry.id);
    if (!r.ok) return flash('error', () => `${r.error.message} ${r.error.hint}`);
    if (open?.entry.id === entry.id) setOpen(null);
    await reload();
  };
  const label = (e: HistoryEntry) => (e.kind === 'daily' ? t('Daily backup of {date}', { date: e.createdAt.slice(0, 10) }) : e.name);
  // Older version first, so "added" means added since that version.
  const cmp = useMemo(() => (open ? compareSnapshots(makeSnapshot(open.project, lib), makeSnapshot(project, lib)) : null), [open, project, lib]);

  return (
    <Modal title={t('Project history')} wide onClose={close}>
      <p className="hint">{t('CablePilot keeps a backup of this project the first time it changes each day (the last 30 days), and the versions you save with a name. They are kept in the app\'s data folder on this computer, in addition to the project file, never instead of it.')}</p>
      <div className="rev-form">
        <label className="prop"><span>{t('Version name')}</span><input type="text" data-testid="hist-name" value={name} placeholder={t('For example: sent to the customer')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && void save()} /></label>
        <button type="button" data-testid="hist-save" disabled={!name.trim()} onClick={() => void save()}>{t('Save version')}</button>
      </div>
      {entries.length === 0 && <p className="hint" data-testid="hist-empty">{t('No backup or version yet.')}</p>}
      {entries.length > 0 && (
        <table className="bom" data-testid="hist-table">
          <thead><tr><th scope="col">{t('Version')}</th><th scope="col">{t('Date')}</th><th scope="col" /></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={open?.entry.id === e.id ? 'selected' : ''} data-kind={e.kind}>
                <td>{label(e)}</td><td>{when(e.createdAt)}</td>
                <td>
                  <button type="button" data-testid="hist-open" onClick={() => void load(e)}>{t('Compare...')}</button>{' '}
                  {e.kind === 'version' && <button type="button" data-testid="hist-remove" onClick={() => void remove(e)}>{t('Remove')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && cmp && (
        <section data-testid="hist-compare">
          <h3>{t('{name} compared with the working copy', { name: label(open.entry) })}</h3>
          {[cmp.pages, cmp.devices, cmp.wires, cmp.parts].every((c) => c.length === 0) && <p className="hint">{t('Nothing differs.')}</p>}
          <div className="rev-compare">
            <ChangeList title={t('Pages')} testid="hist-pages" items={cmp.pages.map((p) => ({ key: p.title, status: p.status }))} />
            <ChangeList title={t('Devices')} testid="hist-devices" items={changeItems(cmp.devices)} />
            <ChangeList title={t('Wires')} testid="hist-wires" items={changeItems(cmp.wires)} />
            <ChangeList title={t('Parts')} testid="hist-parts" items={changeItems(cmp.parts)} />
          </div>
          <div className="row-buttons">
            <button type="button" data-testid="hist-restore" onClick={restore}>{t('Restore this version')}</button>
          </div>
        </section>
      )}
    </Modal>
  );
}
