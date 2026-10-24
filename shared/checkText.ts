// The texts of the electrical rule check: what each finding says, what its fix does, and which
// standard each rule rests on. UI text goes through t() (English and Italian); standard names are
// not translated.

import { t } from './i18n';
import type { Fix, Finding, RuleId } from './checks';

/** The standard and clause a rule rests on (also cited in shared/checks.ts); clauses to confirm are in docs/to-verify.md. */
export const RULE_SOURCE: Record<RuleId, string> = {
  'duplicate-designation': 'IEC 81346-1',
  'unconnected-wire': 'IEC 61082-1',
  'coil-no-contacts': 'IEC 81346-2, IEC 61082-1',
  'contact-no-coil': 'IEC 81346-2, IEC 61082-1',
  'contacts-exceeded': 'IEC 60947-5-1',
  'potential-conflict': 'IEC 60204-1 clause 13.2',
  'cable-size': 'IEC 60364-5-52 Annex B, IEC 60364-4-43',
  'method-missing': 'IEC 60364-5-52',
  'colour-pe': 'IEC 60204-1 clause 13.2, IEC 60445',
  'colour-gnye': 'IEC 60204-1 clause 13.2, IEC 60445',
  'colour-neutral': 'IEC 60204-1 clause 13.2, IEC 60445',
  'missing-pe': 'IEC 60204-1 clause 8.2, IEC 61439-1',
  'terminal-wires': 'IEC 60204-1 clause 13.1',
  'plc-address': 'CablePilot rule 5',
};

export function ruleTitle(rule: RuleId): string {
  switch (rule) {
    case 'duplicate-designation': return t('Duplicate designation');
    case 'unconnected-wire': return t('Unconnected wire end');
    case 'coil-no-contacts': return t('Coil without contacts');
    case 'contact-no-coil': return t('Contact without coil');
    case 'contacts-exceeded': return t('More contacts used than available');
    case 'potential-conflict': return t('Two potentials connected');
    case 'cable-size': return t('Conductor cross-section');
    case 'method-missing': return t('Installation method not stated');
    case 'colour-pe': case 'colour-gnye': case 'colour-neutral': return t('Conductor colour');
    case 'missing-pe': return t('Missing PE connection');
    case 'terminal-wires': return t('Too many wires on a terminal');
    case 'plc-address': return t('PLC address used twice');
  }
}

export interface TextCtx {
  /** Page title or number for a page id. */
  pageName(id: string): string;
}

const s = (v: string | number | undefined): string => String(v ?? '');

/** The sentence a finding shows in the message list and the banner. */
export function findingText(f: Finding, ctx: TextCtx): string {
  const a = f.args;
  switch (f.rule) {
    case 'duplicate-designation': return t('Designation {des} is used by more than one device (also on page {page}).', { des: s(a.des), page: ctx.pageName(s(a.other)) });
    case 'unconnected-wire': return a.stray ? t('A wire on page {page} is not connected at either end.', { page: ctx.pageName(f.page ?? '') }) : t('A wire end on page {page} is not connected to anything.', { page: ctx.pageName(f.page ?? '') });
    case 'coil-no-contacts': return t('Coil {des} has no contacts: no contact or power part with this designation is drawn.', { des: s(a.des) });
    case 'contact-no-coil': return t('Contact {des} has no coil: no coil or device with this designation is drawn.', { des: s(a.des) });
    case 'contacts-exceeded': return t('{des} uses {used} but its parts provide {have}.', { des: s(a.des), used: s(a.used), have: s(a.have) });
    case 'potential-conflict': return t('Two potentials are connected together: {potentials}.', { potentials: s(a.potentials) });
    case 'cable-size':
      return a.min === ''
        ? t('Conductor {wire} ({xs} mm²) at {device} ({rating} A) is too small for installation method {method}: capacity {cap} A, and the device is above the largest size in the table.', { wire: s(a.wire) || '-', xs: s(a.xs), device: s(a.device), rating: s(a.rating), method: s(a.method), cap: s(a.cap) })
        : t('Conductor {wire} ({xs} mm²) at {device} ({rating} A) is too small for installation method {method}: capacity {cap} A, at least {min} mm² needed.', { wire: s(a.wire) || '-', xs: s(a.xs), device: s(a.device), rating: s(a.rating), method: s(a.method), cap: s(a.cap), min: s(a.min) });
    case 'method-missing': return t('The installation method of the conductors is not stated, so cross-sections are not checked. Set it in Project settings.');
    case 'colour-pe': return t('The protective conductor ({potential}) is {colour}; it must be green-and-yellow (GNYE).', { potential: s(a.potential), colour: s(a.colour) });
    case 'colour-gnye': return t('A conductor of potential {potential} is green-and-yellow (GNYE), which is reserved for protective conductors.', { potential: s(a.potential) });
    case 'colour-neutral': return t('The neutral conductor ({potential}) is {colour}; it is normally blue (BU).', { potential: s(a.potential), colour: s(a.colour) });
    case 'missing-pe': return t('No protective earth (PE) connection: live circuits are drawn but no PE conductor or earth symbol is connected.');
    case 'terminal-wires': return t('Terminal {des}:{no} has {n} wires; its terminal part allows {max}.', { des: s(a.des), no: s(a.no), n: s(a.n), max: s(a.max) });
    case 'plc-address': return t('PLC address {address} is used twice (also on page {page}).', { address: s(a.address), page: ctx.pageName(s(a.other)) });
  }
}

/** The second line of a finding: the assumptions of a check that depends on installation conditions. */
export function findingDetail(f: Finding): string {
  if (f.rule !== 'cable-size') return '';
  return t('Assumptions: PVC-insulated copper conductors, {ambient} °C ambient, three loaded conductors, grouping {grouping}, method {method}; the device is taken as the protection of every conductor connected to it. Table values are not yet verified against IEC 60364-5-52. This check does not replace the engineer\'s verification.', { method: s(f.args.method), ambient: s(f.args.ambient), grouping: s(f.args.grouping) });
}

export function fixText(fix: Fix): string {
  switch (fix.id) {
    case 'rename-designation': return t('Rename to {to}', { to: s(fix.args.to) });
    case 'remove-wire': return t('Remove the wire');
    case 'wire-type': return t('Set to {xs} mm² {colour}', { xs: s(fix.args.xs), colour: s(fix.args.colour) });
  }
}
