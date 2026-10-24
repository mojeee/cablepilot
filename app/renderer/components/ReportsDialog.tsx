// Live reports: pick a report, see its table (computed from the schematic), export it as CSV, export
// all lists as one XLSX workbook, add report pages to the drawing set. Nothing here is typed twice.
import { useMemo, useState } from 'react';
import { t } from '@shared/i18n';
import { REPORT_IDS, type ReportId } from '@shared/model/types';
import { reportTable } from '@shared/reports';
import { reportRows } from '@shared/draw/report';
import { useEditor } from '../state/editor';
import { Modal } from './Modal';

export function reportLabel(id: ReportId): string {
  switch (id) {
    case 'terminals': return t('Terminal diagram');
    case 'cables': return t('Cable list');
    case 'wires': return t('Wire list');
    case 'pins': return t('Connector pin lists');
    case 'bom': return t('Bill of materials');
    case 'contents': return t('Contents');
    case 'legend': return t('Symbol legend');
    case 'colours': return t('Conductor colours');
    case 'suffixes': return t('Wire number suffixes');
    case 'torque': return t('Terminal tightening torques');
    case 'nameplates': return t('Nameplates');
    case 'wireMarkers': return t('Wire markers');
    case 'terminalMarkers': return t('Terminal markers');
  }
}

export function ReportsDialog() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  const st = useEditor.getState();
  const [id, setId] = useState<ReportId>('terminals');
  const table = useMemo(() => reportTable(project, lib, id), [project, lib, id]);
  const rows = useMemo(() => reportRows(project, lib, id), [project, lib, id]);
  return (
    <Modal title={t('Reports')} wide onClose={() => st.setDialog(null)}>
      <p className="hint">{t('Lists are generated from the schematic and update with it. They print in the drawing language of the project.')}</p>
      <div className="reports">
        <ul className="report-list" aria-label={t('Reports')}>
          {REPORT_IDS.map((r) => (
            <li key={r}><button type="button" data-testid={`report-${r}`} className={r === id ? 'selected' : ''} aria-current={r === id} onClick={() => setId(r)}>{reportLabel(r)}</button></li>
          ))}
        </ul>
        <div className="report-body">
          <div className="bom-controls">
            <button type="button" data-testid="report-csv" onClick={() => void st.exportReportCsv(id)}>{t('Export CSV')}</button>
            <button type="button" data-testid="export-xlsx" onClick={() => void st.exportXlsx()}>{t('Export all lists as XLSX')}</button>
            <button type="button" data-testid="report-add-pages" onClick={() => st.addReportPages([id])}>{t('Add as pages')}</button>
            <button type="button" data-testid="export-dxf" title={t('Export this page as DXF')} onClick={() => void st.exportDxf()}>{t('Export DXF')}</button>
            <button type="button" data-testid="import-dxf" title={t('Import a DXF file as a new page of plain graphics')} onClick={() => void st.importDxf()}>{t('Import DXF')}</button>
            <button type="button" data-testid="report-sync" onClick={() => st.syncReportPages()}>{t('Complete report pages')}</button>
          </div>
          <p className="hint">{t('{n} rows', { n: rows })}</p>
          <table className="bom" data-testid="report-table">
            <thead><tr>{table.headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {table.rows.length === 0 && <tr><td colSpan={Math.max(1, table.headers.length)}>{id === 'nameplates' ? t('Nothing to show yet: give devices a function text.') : t('Nothing to show yet.')}</td></tr>}
              {table.rows.map((r, i) => (
                <tr key={i} className={r.heading ? 'assembly' : ''}>{table.headers.map((_, j) => <td key={j}>{r.cells[j] ?? ''}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {table.note && <p className="hint">{table.note}</p>}
        </div>
      </div>
    </Modal>
  );
}
