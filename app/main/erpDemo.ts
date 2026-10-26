// The demo ERP (M8 part 1, rule 10): a small HTTP server on 127.0.0.1 and a random port, started only when the user
// asks for it, so the two-way ERP link can be shown and tested without a real ERP. It serves the generic sample
// stock list as OData v4 JSON in pages of 25 (camelCase fields, the stock nested as an ERP API would) and accepts
// reservation requests, raising "reserved" by what each line takes. Nothing leaves the computer.

import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { parseCsv } from '@shared/export/csv';
import { RESERVATION_FORMAT } from '@shared/erp';

export const DEMO_PAGE_SIZE = 25;

interface DemoItem {
  itemNo: string;
  displayName: string;
  manufacturer: string;
  inventory: { onHand: number; reserved: number };
  warehouse: string;
  location: string;
  unitOfMeasure: string;
}

/** The sample stock list (samples/stock-sample.csv) as demo ERP items. */
export function demoItems(csvText: string): DemoItem[] {
  const [head, ...rows] = parseCsv(csvText);
  const col = (name: string) => head.findIndex((h) => h.trim() === name);
  const c = { code: col('Part code'), man: col('Manufacturer'), desc: col('Description'), on: col('On hand'), res: col('Reserved'), loc: col('Location'), wh: col('Warehouse'), unit: col('Unit') };
  return rows.filter((r) => r[c.code]).map((r) => ({
    itemNo: r[c.code],
    displayName: r[c.desc] ?? '',
    manufacturer: r[c.man] ?? '',
    inventory: { onHand: Number(r[c.on]) || 0, reserved: Number(r[c.res]) || 0 },
    warehouse: r[c.wh] ?? '',
    location: r[c.loc] ?? '',
    unitOfMeasure: r[c.unit] ?? 'pcs',
  }));
}

function body(req: IncomingMessage, max = 5 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (b: Buffer) => {
      size += b.length;
      if (size > max) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(b);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export class DemoErp {
  private server: Server | null = null;
  private items: DemoItem[] = [];
  private count = 0;
  /** The reservations received, newest last (for the end-to-end test and the demo). */
  readonly received: unknown[] = [];

  constructor(private readonly stockCsv: string) {}

  get url(): string | null {
    const a = this.server?.address() as AddressInfo | null | undefined;
    return a ? `http://127.0.0.1:${a.port}` : null;
  }

  async start(): Promise<string> {
    if (this.url) return this.url;
    this.items = demoItems(readFileSync(this.stockCsv, 'utf8'));
    this.server = createServer((req, res) => {
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json; odata.metadata=minimal' });
        res.end(JSON.stringify(json));
      };
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && u.pathname === '/odata/Items') {
        const skip = Math.max(0, Number(u.searchParams.get('$skip')) || 0);
        const page = this.items.slice(skip, skip + DEMO_PAGE_SIZE);
        const more = skip + DEMO_PAGE_SIZE < this.items.length;
        // A relative next link, as OData allows: the client resolves it against the request URL.
        return send(200, { '@odata.context': '$metadata#Items', value: page, ...(more ? { '@odata.nextLink': `Items?$skip=${skip + DEMO_PAGE_SIZE}` } : {}) });
      }
      if (req.method === 'POST' && u.pathname === '/odata/Reservations') {
        void body(req).then((text) => {
          let doc: { format?: unknown; lines?: { code?: unknown; from?: { warehouse?: unknown; location?: unknown; qty?: unknown }[] }[] };
          try {
            doc = JSON.parse(text) as typeof doc;
          } catch {
            return send(400, { error: { message: 'The request is not JSON.' } });
          }
          if (doc.format !== RESERVATION_FORMAT || !Array.isArray(doc.lines)) return send(400, { error: { message: 'Not a CablePilot reservation request.' } });
          let taken = 0;
          for (const l of doc.lines) for (const f of l.from ?? []) {
            const it = this.items.find((i) => i.itemNo === l.code && i.warehouse === f.warehouse && i.location === f.location);
            const q = typeof f.qty === 'number' && f.qty > 0 ? f.qty : 0;
            if (it && q) { it.inventory.reserved += q; taken++; }
          }
          this.received.push(doc);
          this.count++;
          send(201, { id: `RES-${String(this.count).padStart(4, '0')}`, lines: taken });
        }, () => send(413, { error: { message: 'The request is too large.' } }));
        return;
      }
      send(404, { error: { message: 'Not found.' } });
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(0, '127.0.0.1', () => resolve());
    });
    return this.url as string;
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }
}
