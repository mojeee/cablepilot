// PLC racks and I/O cards (M5). A card is a black box (shared/draw/box) with `plc` set; its pins are the
// channels. Addresses are assigned per card and channel by the project's addressing scheme and stored on
// the pins, so the overview, the tag lists, the report page and the address check all read one place
// (rule 1). Edits (by hand, by assignment, by import) are the commands `plc/channels` and `plc/assign`.
//
// Tag-list formats and their sources:
//  - CODESYS: the declaration text of a global variable list, `name AT %IX0.0 : BOOL;`. The AT syntax
//    (area I/Q/M, size X/B/W/D, byte.bit) is documented in the CODESYS Online Help, topic "AT Declaration"
//    (https://content.helpme-codesys.com/en/CODESYS%20Development%20System/_cds_at_declaration.html),
//    checked 2026-10-24. Comments use the IEC 61131-3 comment `(* ... *)`. Not yet tried in the CODESYS IDE.
//  - TIA Portal: the XML of a PLC tag table in the Openness layout (SW.Tags.PlcTagTable / SW.Tags.PlcTag with
//    Name, DataTypeName, LogicalAddress and a MultilingualText comment). UNVERIFIED: Siemens' own
//    documentation was not reachable (HTTP 403); the layout follows a worked example of an exported table
//    (https://www.dmcinfo.com/blog/21173/using-xml-templates-in-tia-openness/). Listed in docs/to-verify.md.
//    TIA writes word addresses as byte offsets (%IW64); CODESYS counts words (%IW32).

import { boxPinsWorld, withPin } from './draw/box';
import { formatPosition, keyOf, zoneAt } from './devices';
import type { Lang } from './i18n';
import type { Library, PartDef } from './library/types';
import { withProjectSymbols } from './library/types';
import type { BoxEl, Page, PlcSettings, PlcType, Project } from './model/types';
import { destinations, netlist } from './netlist';

export const PLC_TYPES: readonly PlcType[] = ['cpu', 'di', 'do', 'ai', 'ao'];
export type AddressStyle = PlcSettings['style'];
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

// ---- addresses ------------------------------------------------------------------------------------

export interface Addr { area: 'I' | 'Q'; size: 'X' | 'W'; byte: number; bit: number }

/** "I0.1", "%IX0.1", "%Q0.0", "IW64" (style siemens: byte) or "%IW32" (style iec: word); undefined when it is not an address. */
export function parseAddress(text: string, style: AddressStyle): Addr | undefined {
  const s = text.replace(/[%\s]/g, '').toUpperCase();
  let m = /^([IQ])X?(\d+)\.([0-7])$/.exec(s);
  if (m) return { area: m[1] as 'I' | 'Q', size: 'X', byte: Number(m[2]), bit: Number(m[3]) };
  m = /^([IQ])W(\d+)$/.exec(s);
  if (m) return { area: m[1] as 'I' | 'Q', size: 'W', byte: style === 'iec' ? Number(m[2]) * 2 : Number(m[2]), bit: 0 };
  return undefined;
}
export function formatAddress(a: Addr, style: AddressStyle): string {
  if (a.size === 'X') return style === 'iec' ? `%${a.area}X${a.byte}.${a.bit}` : `${a.area}${a.byte}.${a.bit}`;
  return style === 'iec' ? `%${a.area}W${Math.floor(a.byte / 2)}` : `${a.area}W${a.byte}`;
}
/** One spelling for comparing addresses: no percent sign, upper case, "IX0.0" is "I0.0". Used by the duplicate check. */
export const canonicalAddress = (text: string): string => text.replace(/[%\s]/g, '').toUpperCase().replace(/^([IQ])X(?=\d)/, '$1');

// ---- cards and channels ---------------------------------------------------------------------------

export interface CardRef { page: Page; pageIndex: number; el: BoxEl; key: string }
/** Every PLC card (CPU and I/O) in rack and slot order. */
export function plcCards(project: Project): CardRef[] {
  const out: CardRef[] = [];
  project.pages.forEach((page, pageIndex) => {
    for (const el of page.elements) if (el.kind === 'box' && el.plc) out.push({ page, pageIndex, el, key: keyOf(page, el.designation, el.location) });
  });
  return out.sort((a, b) => natural(a.el.plc!.rack, b.el.plc!.rack) || a.el.plc!.slot - b.el.plc!.slot || a.pageIndex - b.pageIndex || a.el.y - b.el.y);
}
/** The first free slot of a rack. */
export const nextSlot = (project: Project, rack: string): number => plcCards(project).filter((c) => c.el.plc!.rack === rack).reduce((m, c) => Math.max(m, c.el.plc!.slot + 1), 0);

const pinsInOrder = (el: BoxEl) => el.pins.slice().sort((a, b) => natural(a.id, b.id));

/** A card box from a library part (its "Card type" and "Channels" data): pins 0 to n-1 on the left side. */
export function cardFromPart(part: PartDef, o: { id: string; x: number; y: number; rack: string; slot: number }): BoxEl | undefined {
  const type = part.data['Card type'] as PlcType | undefined;
  if (!type || !PLC_TYPES.includes(type)) return undefined;
  const n = type === 'cpu' ? 0 : Math.max(0, Math.floor(Number(part.data.Channels)) || 0);
  let el: BoxEl = { id: o.id, kind: 'box', variant: 'blackbox', x: o.x, y: o.y, w: type === 'cpu' ? 40 : 46, h: 20, designation: '', pins: [], functionText: { en: part.title.en, it: part.title.it }, plc: { type, rack: o.rack, slot: o.slot } };
  for (let i = 0; i < n; i++) el = withPin(el, 'left', String(i));
  return el;
}

export interface ChannelEdit { page: string; el: string; /** '' for a channel symbol (plc-input / plc-output): only the address is edited, it is the symbol's value. */ pin: string; patch: { address?: string; tag?: string; comment?: string } }

/** Applies channel edits (an empty text removes the field). Used by the commands. */
export function applyChannelEdits(project: Project, edits: ChannelEdit[]): Project {
  if (!edits.length) return project;
  const by = new Map<string, ChannelEdit[]>();
  for (const e of edits) (by.get(e.page) ?? by.set(e.page, []).get(e.page)!).push(e);
  const pages = project.pages.map((pg) => {
    const list = by.get(pg.id);
    if (!list) return pg;
    return {
      ...pg,
      elements: pg.elements.map((el) => {
        const mine = list.filter((e) => e.el === el.id);
        if (!mine.length) return el;
        if (el.kind === 'symbol') {
          const a = mine.find((e) => e.patch.address !== undefined)?.patch.address;
          return a === undefined ? el : { ...el, value: a || undefined };
        }
        if (el.kind !== 'box') return el;
        return {
          ...el,
          pins: el.pins.map((p) => {
            const e = mine.find((q) => q.pin === p.id);
            if (!e) return p;
            const next = { ...p };
            for (const k of ['address', 'tag', 'comment'] as const) {
              const v = e.patch[k];
              if (v === undefined) continue;
              if (v) next[k] = v;
              else delete next[k];
            }
            return next;
          }),
        };
      }),
    };
  });
  return { ...project, pages };
}

/**
 * The addresses the scheme gives every channel. Each area (DI, DO, AI, AO) counts bytes from its start in
 * rack and slot order: a digital card takes ceil(channels / 8) bytes, channel n is bit n % 8 of byte n / 8;
 * an analog channel takes two bytes. `all`: replace addresses already written, otherwise fill empty ones.
 */
export function assignEdits(project: Project, all: boolean): ChannelEdit[] {
  const s = project.settings.plc;
  const next = { ...s.start };
  const edits: ChannelEdit[] = [];
  for (const c of plcCards(project)) {
    const type = c.el.plc!.type;
    if (type === 'cpu') continue;
    const area = type === 'di' || type === 'ai' ? 'I' : 'Q';
    const digital = type === 'di' || type === 'do';
    const pins = pinsInOrder(c.el);
    pins.forEach((p, i) => {
      const a: Addr = digital ? { area, size: 'X', byte: next[type] + Math.floor(i / 8), bit: i % 8 } : { area, size: 'W', byte: next[type] + 2 * i, bit: 0 };
      if (all || !p.address) edits.push({ page: c.page.id, el: c.el.id, pin: p.id, patch: { address: formatAddress(a, s.style) } });
    });
    next[type] += digital ? Math.ceil(pins.length / 8) : 2 * pins.length;
  }
  return edits;
}

/** Edits that rewrite every address in another style (changing the scheme keeps the addresses, only the spelling changes). */
export function restyleEdits(project: Project, to: AddressStyle): ChannelEdit[] {
  const from = project.settings.plc.style;
  const edits: ChannelEdit[] = [];
  for (const c of plcCards(project)) for (const p of c.el.pins) {
    const a = p.address ? parseAddress(p.address, from) : undefined;
    if (a) edits.push({ page: c.page.id, el: c.el.id, pin: p.id, patch: { address: formatAddress(a, to) } });
  }
  return edits;
}

export interface ChannelRow {
  id: string;
  page: string;
  pageIndex: number;
  el: string;
  /** Pin id of a card channel; '' for a channel symbol. */
  pin: string;
  /** Full designation of the card ('' for a channel symbol). */
  card: string;
  rack: string;
  slot: number;
  type: PlcType | '';
  address: string;
  tag: string;
  comment: string;
  /** What the channel is wired to: "-X2:3". */
  connected: string;
  /** Cross-reference of the channel on its page: "08.E". */
  position: string;
}

const memo = new WeakMap<Project, { lib: Library; rows: ChannelRow[] }>();
/** Every channel of the project, live from the schematic: cards in rack and slot order, then channel symbols. */
export function plcChannels(project: Project, libIn: Library): ChannelRow[] {
  const hit = memo.get(project);
  if (hit && hit.lib === libIn) return hit.rows;
  const lib = withProjectSymbols(libIn, project.symbols);
  const nl = netlist(project, libIn);
  const rows: ChannelRow[] = [];
  const where = (page: Page, pageIndex: number, x: number, y: number) => {
    const z = zoneAt(project, page, x, y);
    return formatPosition(project.settings.crossRef, pageIndex + 1, z.col, z.row);
  };
  const conn = (page: string, el: string, pin: string) => [...new Set(destinations(nl.byPin.get(`${page}/${el}/${pin}`), { page, el, pin }).map((d) => d.label))].slice(0, 3).join(', ');
  for (const c of plcCards(project)) {
    if (c.el.plc!.type === 'cpu') continue;
    const world = new Map(boxPinsWorld(c.el).map((p) => [p.id, p]));
    for (const p of pinsInOrder(c.el)) {
      const w = world.get(p.id)!;
      rows.push({ id: `${c.page.id}/${c.el.id}/${p.id}`, page: c.page.id, pageIndex: c.pageIndex, el: c.el.id, pin: p.id, card: c.key, rack: c.el.plc!.rack, slot: c.el.plc!.slot, type: c.el.plc!.type, address: p.address ?? '', tag: p.tag ?? '', comment: p.comment ?? '', connected: conn(c.page.id, c.el.id, p.id), position: where(c.page, c.pageIndex, w.x, w.y) });
    }
  }
  project.pages.forEach((page, pageIndex) => {
    for (const el of page.elements) {
      const fn = el.kind === 'symbol' ? lib.symbols.get(el.symbolId)?.function : undefined;
      if (el.kind !== 'symbol' || (fn !== 'plc-input' && fn !== 'plc-output')) continue;
      rows.push({ id: `${page.id}/${el.id}`, page: page.id, pageIndex, el: el.id, pin: '', card: '', rack: '', slot: 0, type: '', address: el.value ?? '', tag: '', comment: '', connected: conn(page.id, el.id, '1'), position: where(page, pageIndex, el.x, el.y) });
    }
  });
  memo.set(project, { lib: libIn, rows });
  return rows;
}

// ---- tag lists -------------------------------------------------------------------------------------

export type TagFormat = 'tia' | 'codesys';
export const TAG_FORMATS: { id: TagFormat; ext: string; verified: boolean }[] = [
  { id: 'tia', ext: 'xml', verified: false },
  { id: 'codesys', ext: 'txt', verified: true },
];
export interface Tag { name: string; /** In the target's notation. */ address: string; dataType: 'BOOL' | 'WORD'; comment: string }

const identifier = (s: string): string => {
  const x = s.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+$/, '');
  return /^\d/.test(x) ? `_${x}` : x;
};
/** The name a channel gets in a tag list when it has no tag: In_0_1, Out_0_0, InW_64. */
const fallbackName = (a: Addr): string => `${a.area === 'I' ? 'In' : 'Out'}${a.size === 'W' ? 'W' : ''}_${a.byte}${a.size === 'X' ? `_${a.bit}` : ''}`;
const styleOf = (f: TagFormat): AddressStyle => (f === 'tia' ? 'siemens' : 'iec');

/** The tags of every channel that has an address: name (the tag, or one made from the address), address in the target's notation, type, comment. */
export function tagList(project: Project, lib: Library, format: TagFormat): Tag[] {
  const style = project.settings.plc.style;
  const seen = new Map<string, number>();
  const out: Tag[] = [];
  for (const r of plcChannels(project, lib)) {
    const a = parseAddress(r.address, style);
    if (!a) continue;
    let name = identifier(r.tag) || fallbackName(a);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (n > 1) name = `${name}_${n}`;
    const target = formatAddress(a, styleOf(format));
    out.push({ name, address: format === 'tia' ? `%${target}` : target, dataType: a.size === 'X' ? 'BOOL' : 'WORD', comment: r.comment });
  }
  return out;
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmlUnesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The tag list as text in a format: TIA Portal PLC tag table XML (unverified) or a CODESYS global variable list. */
export function exportTags(project: Project, lib: Library, format: TagFormat): string {
  const tags = tagList(project, lib, format);
  const lang: Lang = project.settings.drawingLanguage;
  if (format === 'codesys') {
    const lines = tags.map((t) => `  ${t.name} AT ${t.address} : ${t.dataType};${t.comment ? ` (* ${t.comment.replace(/\*\)/g, '* )').replace(/\s*\n\s*/g, ' ')} *)` : ''}`);
    return `(* ${project.name}: I/O tags generated by CablePilot. Paste into the text view of a global variable list. *)\nVAR_GLOBAL\n${lines.join('\n')}\nEND_VAR\n`;
  }
  let id = 0;
  const hex = () => (id++).toString(16).toUpperCase();
  const table = identifier(project.name) || 'CablePilot_IO';
  const body = tags.map((t) => {
    const tagId = hex();
    const comment = t.comment
      ? `\n        <ObjectList>\n          <MultilingualText ID="${hex()}" CompositionName="Comment">\n            <ObjectList>\n              <MultilingualTextItem ID="${hex()}" CompositionName="Items">\n                <AttributeList>\n                  <Culture>${lang === 'it' ? 'it-IT' : 'en-US'}</Culture>\n                  <Text>${xmlEsc(t.comment)}</Text>\n                </AttributeList>\n              </MultilingualTextItem>\n            </ObjectList>\n          </MultilingualText>\n        </ObjectList>`
      : '';
    return `      <SW.Tags.PlcTag ID="${tagId}" CompositionName="Tags">\n        <AttributeList>\n          <DataTypeName>${t.dataType === 'BOOL' ? 'Bool' : 'Word'}</DataTypeName>\n          <ExternalAccessible>true</ExternalAccessible>\n          <ExternalVisible>true</ExternalVisible>\n          <ExternalWritable>true</ExternalWritable>\n          <LogicalAddress>${t.address}</LogicalAddress>\n          <Name>${xmlEsc(t.name)}</Name>\n        </AttributeList>${comment}\n      </SW.Tags.PlcTag>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n<Document>\n  <SW.Tags.PlcTagTable ID="${hex()}">\n    <AttributeList>\n      <Name>${xmlEsc(table)}</Name>\n    </AttributeList>\n    <ObjectList>\n${body.join('\n')}\n    </ObjectList>\n  </SW.Tags.PlcTagTable>\n</Document>\n`;
}

export interface ParsedTag { name: string; address: string; comment: string }
/** Reads the tags (name, address, comment) of a file in a format. An empty list: nothing readable. */
export function parseTags(text: string, format: TagFormat): ParsedTag[] {
  const out: ParsedTag[] = [];
  if (format === 'tia') {
    for (const m of text.matchAll(/<SW\.Tags\.PlcTag\b[\s\S]*?<\/SW\.Tags\.PlcTag>/g)) {
      const pick = (tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(m[0])?.[1];
      const name = pick('Name'), address = pick('LogicalAddress'), comment = pick('Text');
      if (name && address) out.push({ name: xmlUnesc(name.trim()), address: xmlUnesc(address.trim()), comment: xmlUnesc((comment ?? '').trim()) });
    }
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_]\w*)\s+AT\s+(%[IQM][XBWD]?[\d.]+)\s*:\s*\w+\s*;\s*(?:\(\*([\s\S]*?)\*\)|\/\/(.*))?\s*$/i.exec(line);
    if (m) out.push({ name: m[1], address: m[2], comment: (m[3] ?? m[4] ?? '').trim() });
  }
  return out;
}

export interface ImportRow { tag: ParsedTag; status: 'set' | 'same' | 'unmatched' | 'invalid'; /** The project's address the tag matched. */ address?: string }
export interface ImportPlan { rows: ImportRow[]; edits: ChannelEdit[] }
/** What importing would do: tags are matched to channels by address; matched channels get the tag name and the comment. Nothing is created and nothing is applied here. */
export function planImport(project: Project, lib: Library, tags: ParsedTag[], format: TagFormat): ImportPlan {
  const style = project.settings.plc.style;
  const byAddr = new Map<string, ChannelRow>();
  for (const r of plcChannels(project, lib)) if (r.address && !byAddr.has(canonicalAddress(r.address))) byAddr.set(canonicalAddress(r.address), r);
  const rows: ImportRow[] = [];
  const edits: ChannelEdit[] = [];
  for (const tag of tags) {
    const a = parseAddress(tag.address, styleOf(format));
    if (!a) { rows.push({ tag, status: 'invalid' }); continue; }
    const mine = formatAddress(a, style);
    const ch = byAddr.get(canonicalAddress(mine));
    if (!ch || !ch.pin) { rows.push({ tag, status: 'unmatched', address: mine }); continue; }
    const patch: ChannelEdit['patch'] = {};
    // A name the export made up for an untagged channel, or the tag in identifier form, is not a change.
    if (tag.name !== ch.tag && tag.name !== (ch.tag ? identifier(ch.tag) : fallbackName(a))) patch.tag = tag.name;
    if (tag.comment && tag.comment !== ch.comment) patch.comment = tag.comment;
    if (Object.keys(patch).length) { edits.push({ page: ch.page, el: ch.el, pin: ch.pin, patch }); rows.push({ tag, status: 'set', address: mine }); } else rows.push({ tag, status: 'same', address: mine });
  }
  return { rows, edits };
}
