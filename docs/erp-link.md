# ERP link

CablePilot talks to the company's ERP in both directions:

- **ERP → CablePilot:** items and stock are pulled over HTTP and become the warehouse stock list, exactly as if a
  stock file had been imported. Sizing suggestions, the BOM stock columns, shortages and the picking list all use it.
- **CablePilot → ERP:** the parts a project needs go back as a **reservation request**. You see it first; it is sent
  only when you press Send, by HTTP POST or as files in an outbox folder.

Everything runs on your computer. CablePilot never changes stock in the ERP directly: it asks, and the ERP (or a small
adapter your IT writes) decides what to reserve. The format is versioned; this page describes version 1.

Open it from the **Reports** tab (**ERP** group), the warehouse window (**ERP settings...**) or the command line
(`ERP`, `ERPPULL`, `RESERVE`).

## Try it without an ERP

**ERP settings → Try the demo ERP** starts a small ERP on this computer (127.0.0.1, a random port) with the generic
sample stock list. It answers like an OData v4 service in pages of 25 and accepts reservations, raising the reserved
quantity of each warehouse row. Nothing leaves the computer. It stops when the app closes.

## Pulling items and stock

| Setting | Meaning |
| --- | --- |
| Items address | The URL that lists items with their stock, returning JSON. An OData entity set (`https://erp/odata/Items`) or any REST endpoint. Filters go in the URL (`?$filter=...`, `?$select=...`). |
| Rows path | Where the list of records is in the answer, as a dotted path: `value` for OData, `d.results` for OData v2, empty when the answer itself is a list. |
| Next page path | Where the address of the next page is: `@odata.nextLink` for OData; empty when the ERP does not page. A relative address is resolved against the current page. |
| Pull automatically | Every so many minutes (at least 5), or 0 for only when you press **Pull from ERP**. |

Each record becomes a row; nested objects are flattened with dots (`inventory.onHand`), arrays and OData annotations
(`@odata.etag`) are left out. The first pull opens the same **column-mapping wizard** as a stock file. CablePilot
guesses the usual names, including camelCase and nested ERP fields (`itemNo`, `displayName`, `inventory.onHand`,
`baseUnitOfMeasureCode`); you correct what it got wrong once, and the mapping is saved for your company.

Several warehouse rows for the same code (one per warehouse or bin) are fine: availability takes from the row with
the most free stock first.

Limits: 30 seconds per request, 50 pages, 100,000 records and 50 MB per answer. When the ERP has more, filter the
items in the address.

## Signing in

| Authentication | Sent as |
| --- | --- |
| None | nothing |
| User name and password | `Authorization: Basic …` |
| Bearer token | `Authorization: Bearer …` |
| API key in a header | `<Header name>: …` (for example `X-API-Key`) |

The password or token is encrypted by the operating system (Keychain on macOS, DPAPI on Windows, the keyring on
Linux) and stored in the app's data folder. Without OS encryption it is not stored at all. It is never shown again,
never sent to the user interface, and removed from every error message. It is only sent to the server of the items
address: a next-page link that points to another server stops the pull. Plain `http://` works (an ERP on the company
network often has no certificate), but the settings warn when a password would travel unencrypted to another
computer.

## Picking a part from the warehouse

Select a device, then **Pick from warehouse...** in its properties (or open the warehouse window while choosing a
part). Each stock row gets **Use for -K1**. It adds the part to the device as one undoable step:

- the **library part** the stock code is linked to (by the same part code or a link you set), so sizing has its
  technical data;
- otherwise a **project part made from the ERP item** (code, manufacturer, description). It has no technical data,
  so sizing shows it as "data missing" and never proposes it for a rating. Link the stock code to a library part
  when you want it sized.

## The reservation request

**Reserve** (Reports tab) or **Reservation request...** (warehouse window) shows one line per part the project uses:
the quantity (quantity per device × units to build; cable in metres from the cable lengths), the unit, where it
would come from (warehouse, location and quantity, most free stock first), what is short, and the devices that use
it. Nothing in the project changes.

Send it to the ERP by **HTTP POST** (the reservation address) or write it to an **outbox folder** your ERP imports
from. You can also save it as JSON or CSV. After a successful send the stock is pulled again, so the reserved
quantities the ERP set are shown.

### JSON

```json
{
  "format": "cablepilot-reservation",
  "version": 1,
  "createdAt": "2026-10-26T10:20:30.000Z",
  "project": { "id": "…", "name": "Conveyor line", "drawingNo": "…", "orderNo": "ORD 42/A", "client": "…" },
  "units": 3,
  "stockDate": "2026-10-26",
  "lines": [
    {
      "code": "GEN-CONTACTOR-18A",
      "description": "Contactor 3 poles, 18 A AC-3, coil 24 V DC",
      "manufacturer": "Generic",
      "qty": 9,
      "unit": "pcs",
      "devices": ["-KM1", "-KM2"],
      "from": [
        { "warehouse": "Main", "location": "A-1", "qty": 8 },
        { "warehouse": "Branch", "location": "B-1", "qty": 1 }
      ],
      "short": 0,
      "inStock": true
    }
  ]
}
```

- `code` is the ERP item code: the stock item the part is linked to, or the part's own code when there is no stock
  item (then `inStock` is false, `from` is empty and `short` equals `qty`).
- `qty` and `short` are in `unit`. `from` lists what to take from each warehouse row; their sum plus `short` is `qty`.
- Lines are sorted by code, so two requests of the same project diff well.

### HTTP

`POST <reservation address>` with `Content-Type: application/json`, the JSON above as the body and the same sign-in
as the pull. Any 2xx status counts as accepted. When the answer is JSON with `id`, `number` or `reference`, that value
is shown as the ERP's reference ("Reservation request sent to the ERP: RES-0001").

### Outbox folder

Two files with the same name, written under a temporary name and then renamed (so an ERP watching the folder never
reads half a file): `reservation-<order or project>-<yyyymmddhhmmss>.json` and `.csv`. The CSV has one row per line
and source warehouse:

```
project,order_no,code,description,manufacturer,qty,unit,warehouse,location,take,short,devices
```

It is UTF-8 with a byte order mark, comma-separated (semicolons when the UI is Italian), like every CSV CablePilot writes.

## Common ERPs

These are starting points, not tested integrations: check the exact addresses with your ERP administrator.

- **Microsoft Dynamics 365 Business Central:** items at `…/api/v2.0/companies(<id>)/items`, rows path `value`, next
  page `@odata.nextLink`; fields `number`, `displayName`, `inventory`, `baseUnitOfMeasureCode` map automatically.
  Reservations need a small extension or a Power Automate flow that reads the request.
- **SAP S/4HANA:** stock through an OData service such as the material stock API, rows path `value` (OData v4) or
  `d.results` (OData v2); map the plant to Warehouse and the storage location to Location.
- **Odoo, ERPNext and others with a REST API:** point the items address at an endpoint that returns JSON records;
  use the outbox folder or a small script for reservations.
