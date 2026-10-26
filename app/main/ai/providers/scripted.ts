// A scripted, deterministic stand-in for a real model (CP_AI_FAKE=1: unit and end-to-end tests, the demo). It
// drives the same tool loop as Claude, GPT or Gemini: it calls the read and engine tools, reads their results from
// the conversation, and proposes through the propose_* tools, so validation, source tagging, progress events and the
// reply are exercised exactly as with a real provider. No network, no clock.
//
// Scripts, chosen by the newest user text (English or Italian):
//   "simulate a failure"                     the provider fails (server error)
//   star-delta starter, N kW, page P         read_page, find_parts, propose_starter (typical cos phi and efficiency are passed as assumptions)
//   renumber the wires on pages A-B          propose_renumber (also designations, terminals)
//   why does the check say Q3 is too small   run_checks, size_feeder, then an explanation from their results
//   size the feeder of -M1                   size_feeder (read only)
//   layout                                   propose_layout (suggest, or explain)
//   PCB, simulation, KiCad ...               no tool: says plainly it cannot, changes nothing
//   anything else                            read_project, then says what it can do

import { ProviderError, type ChatMessage, type ChatProvider, type ChatRequest, type ChatResponse, type ToolCall, type ToolResult } from './types';
import type { AiProviderId } from '@shared/ai/types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

interface Turn {
  text: string;
  calls: { call: ToolCall; result?: ToolResult }[];
  it: boolean;
}

function readTurn(req: ChatRequest): Turn {
  let last = -1;
  req.messages.forEach((m, i) => { if (m.role === 'user') last = i; });
  const user = last >= 0 ? (req.messages[last] as Extract<ChatMessage, { role: 'user' }>) : null;
  const calls: Turn['calls'] = [];
  for (const m of req.messages.slice(last + 1)) {
    if (m.role === 'assistant') for (const c of m.toolCalls) calls.push({ call: c });
    else if (m.role === 'tool') for (const r of m.results) { const c = calls.find((x) => x.call.id === r.callId); if (c) c.result = r; }
  }
  return { text: user ? (user.content[user.content.length - 1] ?? '') : '', calls, it: /Answer in Italian|Italian\./.test(req.system) };
}

const outcome = (turn: Turn, name: string): { ok: boolean; value: Obj } | null => {
  const hit = [...turn.calls].reverse().find((c) => c.call.name === name && c.result);
  if (!hit?.result) return null;
  let value: unknown = {};
  try { value = JSON.parse(hit.result.content); } catch { value = {}; }
  return { ok: !hit.result.isError, value: isObj(value) ? value : {} };
};

const call = (turn: Turn, name: string, input: Obj): ChatResponse => ({ text: '', toolCalls: [{ id: `fake-${turn.calls.length + 1}`, name, input }], stop: 'tool_use', raw: { provider: 'anthropic', data: null } });
const say = (text: string): ChatResponse => ({ text, toolCalls: [], stop: 'end', raw: { provider: 'anthropic', data: null } });
const L = (turn: Turn, en: string, it: string): string => (turn.it ? it : en);

/** After a proposal tool: report what it said, honestly (a refused proposal is reported, not hidden). */
function afterPropose(turn: Turn, name: string, en: string, it: string): ChatResponse {
  const r = outcome(turn, name)!;
  if (!r.ok) return say(L(turn, `I could not prepare that: ${String(r.value.error)}. Nothing was changed.`, `Non sono riuscito a prepararlo: ${String(r.value.error)}. Non ho cambiato nulla.`));
  return say(L(turn, en, it));
}

const desIn = (text: string): string | undefined => /(?:^|[\s(])(-?[A-Za-z]{1,3}\d+[A-Za-z0-9.]*)(?=[\s?.,)]|$)/.exec(text)?.[1];

function starter(turn: Turn): ChatResponse {
  const kw = Number(/(\d+(?:[.,]\d+)?)\s*kw/i.exec(turn.text)?.[1]?.replace(',', '.'));
  const pg = Number(/(?:page|pagina|pag\.?)\s*(\d+)/i.exec(turn.text)?.[1]);
  if (!kw || !pg) return say(L(turn, 'Which motor power (kW) and which page? For example: "add a star-delta starter for a 7.5 kW motor on page 5".', 'Quale potenza del motore (kW) e quale pagina? Per esempio: "aggiungi un avviatore stella-triangolo per un motore da 7,5 kW a pagina 5".'));
  if (!outcome(turn, 'read_page')) return call(turn, 'read_page', { page: pg });
  if (!outcome(turn, 'find_parts')) return call(turn, 'find_parts', { type: 'Contactor', limit: 4 });
  if (!outcome(turn, 'propose_starter')) return call(turn, 'propose_starter', { page: pg, powerKw: kw, starter: 'star-delta', cosPhi: 0.85, efficiency: 90, assumed: ['cosPhi', 'efficiency'] });
  const r = outcome(turn, 'propose_starter')!;
  const sizing = isObj(r.value.sizing) ? r.value.sizing : {};
  return afterPropose(turn, 'propose_starter',
    `I propose a star-delta starter for a ${kw} kW motor on page ${pg}: the library starter circuit, the motor data, and the ratings from the sizing engine${typeof sizing.ib === 'number' ? ` (Ib about ${sizing.ib} A)` : ''}. I assumed cos φ 0.85 and efficiency 90 %, because you did not state them: these are suggestions to confirm against the nameplate. It is a preview: accept or reject it.`,
    `Propongo un avviatore stella-triangolo per un motore da ${kw} kW a pagina ${pg}: il circuito di potenza della libreria, i dati del motore e le portate dal motore di dimensionamento${typeof sizing.ib === 'number' ? ` (Ib circa ${sizing.ib} A)` : ''}. Ho assunto cos φ 0,85 e rendimento 90 %, perché non li hai indicati: sono suggerimenti da confermare con la targa. È un'anteprima: accettala o rifiutala.`);
}

function renumber(turn: Turn): ChatResponse {
  if (!outcome(turn, 'propose_renumber')) {
    const m = /(\d+)\s*(?:–|-|—|to|a|and|e)\s*(\d+)/i.exec(turn.text);
    const what = /terminal|morset/i.test(turn.text) ? 'terminals' : /designation|designaz|sigl/i.test(turn.text) ? 'designations' : 'wires';
    return call(turn, 'propose_renumber', { what, ...(m ? { fromPage: Number(m[1]), toPage: Number(m[2]) } : {}) });
  }
  const r = outcome(turn, 'propose_renumber')!;
  if (r.ok && typeof r.value.changes !== 'number') return say(L(turn, 'Everything already has the right number in that range: there is nothing to change.', 'Tutto ha già il numero giusto in quell\'intervallo: non c\'è niente da cambiare.'));
  return afterPropose(turn, 'propose_renumber', `I propose to renumber ${String(r.value.changes)} items with the project's numbering rules. Numbers you typed by hand stay as they are. It is a preview.`, `Propongo di rinumerare ${String(r.value.changes)} elementi con le regole di numerazione del progetto. I numeri scritti a mano restano. È un'anteprima.`);
}

function why(turn: Turn): ChatResponse {
  const des = desIn(turn.text.replace(/\b(why|does|the|check|say|is|too|small|perch[eé]|il|controllo|dice|troppo|piccolo)\b/gi, ' '));
  const checks = outcome(turn, 'run_checks');
  if (!checks) return call(turn, 'run_checks', des ? { query: des } : {});
  const findings = Array.isArray(checks.value.findings) ? (checks.value.findings as Obj[]) : [];
  if (!findings.length) return say(L(turn, `The check has no finding${des ? ` that mentions ${des}` : ''}, so I cannot say what is "too small". Run the check again after you save, or tell me which finding you mean.`, `Il controllo non ha segnalazioni${des ? ` che nominano ${des}` : ''}, quindi non so cosa sia "troppo piccolo". Rilancia il controllo o dimmi quale segnalazione intendi.`));
  if (des && !outcome(turn, 'size_feeder')) return call(turn, 'size_feeder', { device: des });
  const f = findings[0];
  const sized = outcome(turn, 'size_feeder');
  const need = sized?.ok && Array.isArray(sized.value.lines) ? (sized.value.lines as Obj[]).find((l) => l.role === 'cable' || l.role === 'wires') : undefined;
  return say(L(turn, `The check says: ${String(f.text)} (rule source: ${String(f.source)}).${need ? ` The sizing engine needs: ${String(need.requirement)}.` : ''} These are suggestions from the stated data and assumptions; confirm them before changing anything.`, `Il controllo dice: ${String(f.text)} (fonte della regola: ${String(f.source)}).${need ? ` Il dimensionamento richiede: ${String(need.requirement)}.` : ''} Sono suggerimenti dai dati e dalle ipotesi indicate: confermali prima di modificare.`));
}

function script(req: ChatRequest): ChatResponse {
  const turn = readTurn(req);
  const p = turn.text.toLowerCase();
  if (/simulate a failure|simula un errore/.test(p)) throw new ProviderError('server', 'anthropic', 'scripted failure', 500);
  if (/(star.?delta|stella.?triangolo)/.test(p)) return starter(turn);
  if (/(renumber|rinumer)/.test(p)) return renumber(turn);
  if (/\b(why|perch[eé])\b/.test(p) && /(check|controll)/.test(p)) return why(turn);
  if (/(pcb|kicad|spice|simulat|simula|autocad dwg|plc program)/.test(p)) return say(L(turn, 'I cannot do that: it is outside what I can build in this project (I read, check and edit the schematic, wires, parts and the cabinet layout). I changed nothing. I can check the project, size a feeder or suggest a layout instead.', 'Non posso farlo: è fuori da ciò che posso costruire in questo progetto (leggo, controllo e modifico schema, fili, componenti e layout del quadro). Non ho cambiato nulla. Posso invece controllare il progetto, dimensionare una linea o suggerire un layout.'));
  if (/(layout|quadro|cabinet|armadio)/.test(p)) {
    const mode = /(explain|spiega|why|perch)/.test(p) ? 'explain' : 'suggest';
    if (!outcome(turn, 'propose_layout')) return call(turn, 'propose_layout', { mode });
    return afterPropose(turn, 'propose_layout', mode === 'explain' ? 'These are the rules the layout is made with; nothing changes.' : 'I propose a cabinet layout from the schematic. It is a preview: accept it, then edit it with the normal tools.', mode === 'explain' ? 'Queste sono le regole con cui si fa il layout; non cambia nulla.' : 'Propongo un layout del quadro dallo schema. È un\'anteprima: accettala, poi modificala con gli strumenti normali.');
  }
  if (/(size|dimension)/.test(p) && desIn(turn.text)) {
    if (!outcome(turn, 'size_feeder')) return call(turn, 'size_feeder', { device: desIn(turn.text) });
    const r = outcome(turn, 'size_feeder')!;
    if (!r.ok) return say(L(turn, String(r.value.error), String(r.value.error)));
    return say(L(turn, 'These are the sizing results for that feeder: suggestions from the stated data and assumptions, to confirm before use.', 'Questi sono i risultati del dimensionamento: suggerimenti dai dati e dalle ipotesi indicate, da confermare prima dell\'uso.'));
  }
  if (!outcome(turn, 'read_project')) return call(turn, 'read_project', {});
  return say(L(turn, 'I read the project. I can check it, explain a finding, size a feeder, renumber wires, add a star-delta starter or suggest a cabinet layout. Tell me which, and I will prepare a preview for you to accept.', 'Ho letto il progetto. Posso controllarlo, spiegare una segnalazione, dimensionare una linea, rinumerare i fili, aggiungere un avviatore stella-triangolo o suggerire un layout del quadro. Dimmi cosa, e preparo un\'anteprima da accettare.'));
}

export class ScriptedProvider implements ChatProvider {
  constructor(readonly id: AiProviderId) {}
  async chat(req: ChatRequest): Promise<ChatResponse> {
    return script(req);
  }
  async check(): Promise<void> {
    // The scripted provider accepts any key.
  }
}
