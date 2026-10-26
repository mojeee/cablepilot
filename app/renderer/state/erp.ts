// The ERP link in the renderer (M8 part 1): the settings as the main process reports them (never the password or
// token), pulls that feed the warehouse like a stock file, the automatic pull, and sending a reservation request
// the user has confirmed. Requests and credentials stay in the main process (app/main/erp.ts).
import { create } from 'zustand';
import { t } from '@shared/i18n';
import type { ErpStatus, ErpTest } from '@shared/api';
import type { ErpConfig, ReservationDoc } from '@shared/erp';
import { useStock } from './stock';
import { useUi } from './ui';

const flash = (severity: 'info' | 'warning' | 'error', text: () => string) => useUi.getState().addMessage(severity, text);
const errMsg = (e: { message: string; hint: string }) => flash('error', () => `${e.message} ${e.hint}`);

interface ErpState {
  status: ErpStatus | null;
  busy: boolean;
  lastTest: ErpTest | null;
  /** When the stock was last pulled from the ERP (ISO time), for the warehouse window. */
  lastPull: string | null;
  load(): Promise<void>;
  saveConfig(config: ErpConfig): Promise<boolean>;
  setSecret(secret: string): Promise<boolean>;
  clearSecret(): Promise<void>;
  pickOutbox(): Promise<void>;
  useDemo(): Promise<void>;
  test(): Promise<void>;
  /** Pulls items and stock into the warehouse; `auto` for the timer (quiet when nothing changed). */
  pull(auto?: boolean): Promise<boolean>;
  /** Sends a reservation request, then pulls the stock again so the ERP's reserved quantities show. */
  send(doc: ReservationDoc): Promise<boolean>;
}

let timer: ReturnType<typeof setInterval> | undefined;
/** Runs the automatic pull every `autoMinutes` (0: off). */
function schedule(status: ErpStatus | null): void {
  clearInterval(timer);
  timer = undefined;
  const m = status?.config.itemsUrl ? status.config.autoMinutes : 0;
  if (m > 0) timer = setInterval(() => void useErp.getState().pull(true), m * 60_000);
}

export const useErp = create<ErpState>((set, get) => {
  const got = (status: ErpStatus) => {
    set({ status });
    schedule(status);
  };
  return {
    status: null, busy: false, lastTest: null, lastPull: null,
    load: async () => {
      const r = await window.cablepilot.erp.status();
      if (r.ok) got(r.value);
    },
    saveConfig: async (config) => {
      const r = await window.cablepilot.erp.setConfig(config);
      if (!r.ok) { errMsg(r.error); return false; }
      got(r.value);
      return true;
    },
    setSecret: async (secret) => {
      const r = await window.cablepilot.erp.setSecret(secret);
      if (!r.ok) { errMsg(r.error); return false; }
      got(r.value);
      flash('info', () => t('The ERP password or token is saved, encrypted by the system.'));
      return true;
    },
    clearSecret: async () => {
      const r = await window.cablepilot.erp.clearSecret();
      if (r.ok) got(r.value);
    },
    pickOutbox: async () => {
      const r = await window.cablepilot.erp.pickOutbox();
      if (!r.ok) return errMsg(r.error);
      if (r.value) got(r.value);
    },
    useDemo: async () => {
      const r = await window.cablepilot.erp.useDemo();
      if (!r.ok) return errMsg(r.error);
      got(r.value);
      flash('info', () => t('The demo ERP is running on this computer with the sample stock list. Nothing leaves the computer.'));
    },
    test: async () => {
      set({ busy: true, lastTest: null });
      const r = await window.cablepilot.erp.test();
      set({ busy: false });
      if (!r.ok) return errMsg(r.error);
      set({ lastTest: r.value });
      flash('info', () => t('ERP connection works: {n} items on the first page.', { n: r.value.records }));
    },
    pull: async (auto = false) => {
      if (get().busy) return false;
      set({ busy: true });
      const r = await window.cablepilot.erp.pull();
      set({ busy: false });
      if (!r.ok) {
        errMsg(r.error);
        return false;
      }
      set({ lastPull: new Date().toISOString() });
      await useStock.getState().receive(r.value);
      if (!auto) flash('info', () => t('Stock pulled from the ERP: {n} records.', { n: Math.max(0, r.value.rows.length - 1) }));
      return true;
    },
    send: async (doc) => {
      set({ busy: true });
      const r = await window.cablepilot.erp.send(doc);
      set({ busy: false });
      if (!r.ok) {
        errMsg(r.error);
        return false;
      }
      const { to, reference } = r.value;
      flash('info', () => (to === 'folder' ? t('Reservation request written to the outbox folder: {ref}.', { ref: reference }) : t('Reservation request sent to the ERP: {ref}.', { ref: reference })));
      if (get().status?.config.itemsUrl) await get().pull(true);
      return true;
    },
  };
});
