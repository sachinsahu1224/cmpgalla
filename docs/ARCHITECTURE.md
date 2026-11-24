# Phase 1A architecture

Abhishek Traders, Rahatgarh. The React screen and Node API on PostgreSQL cover login, company, customers, products, HSN, sales invoices, tax, PDF, and the e-invoice and e-way adapters. Purchase, stock, and accounts wait for Phase 2.

## Applications

- `web/` — React, TypeScript, Vite, Material UI, React Router, TanStack Query, React Hook Form, Zod, Axios. Dev server `http://127.0.0.1:5173`, proxying `/api` to the API.
- `server/` — Express, TypeScript, Prisma, JWT, Zod, decimal.js. Dev server `http://127.0.0.1:4000`.
- PostgreSQL 16. `server/docker-compose.yml` starts it on port 5432 when Docker is available. On this machine Docker is not installed, so `npm run dev` and `npm test` start a local PostgreSQL through `embedded-postgres` (port 54329 for the app, port 54330 for tests).

The Angular app in `frontend/` and the SQLite API in `src/erp/` are the earlier build. They stay in the repo. Phase 1A does not call them.

## Request path

The browser keeps the JWT in `localStorage` and sends `Authorization: Bearer`. The API checks the signature, loads only the signed-in user's company, and writes an audit row inside the same database transaction as the change. GST client secrets, passwords, and public keys are stored on the company row and are never included in a response.

Money is `DECIMAL` in PostgreSQL and `decimal.js` in Node. Taxable value, CGST/SGST/IGST, and round off to the rupee live in `server/src/money.ts` and `server/src/invoice-calc.ts`. Shortage and bardana are applied once, from the company mode stored on the invoice.

## Security

- Passwords are hashed with bcrypt.
- Login is rate-limited.
- Request bodies are checked with Zod.
- `JWT_SECRET` comes from the environment. A development placeholder is used only when the variable is absent and `NODE_ENV` is not `production`.
- `integrationMode` is `MOCK`, `SANDBOX`, or `PRODUCTION`. Mock is the default and does not create an IRN or a government QR. Production calls stay off unless `GST_PRODUCTION_ENABLED=true`. Credentials stay on the server. The adapters are `server/src/gst/`.

## Tables

The migrations create the Phase 1 tables. Sales invoices, e-invoice records, e-way records, and API logs are written by the invoice module. A repeated click returns the existing portal record instead of sending a second request.

```mermaid
erDiagram
  companies ||--o{ users : employs
  companies ||--o{ customers : sells_to
  companies ||--o{ hsn_codes : files
  companies ||--o{ products : stocks
  companies ||--o{ transporters : hires
  companies ||--o{ vehicles : owns
  companies ||--o{ sales_invoices : issues
  companies ||--o{ audit_logs : records
  companies ||--o{ api_transaction_logs : calls
  roles ||--o{ user_roles : grants
  users ||--o{ user_roles : has
  users ||--o{ audit_logs : writes
  hsn_codes ||--o{ products : classifies
  transporters ||--o{ vehicles : runs
  customers ||--o{ sales_invoices : receives
  sales_invoices ||--o{ sales_invoice_items : contains
  products ||--o{ sales_invoice_items : appears_on
  sales_invoices ||--o{ einvoice_records : files
  sales_invoices ||--o{ eway_bill_records : moves
  sales_invoices ||--o{ invoice_documents : prints
```

Each invoice stores a buyer snapshot (`buyerName`, `buyerGstin`, `buyerAddress`, `buyerStateCode`) and the deduction settings used to price it, so a later customer or company edit does not rewrite a filed bill.

## Run

```powershell
cd d:\project\gallasoftware\server
npm test
npm run dev
```

```powershell
cd d:\project\gallasoftware\web
npm run dev
```

Sign in with `admin` / `Admin@123`.

With Docker already running Postgres:

```powershell
cd d:\project\gallasoftware\server
docker compose up -d
$env:DATABASE_URL = "postgresql://galla:galla@127.0.0.1:5432/galla"
$env:JWT_SECRET = "change-this-before-production"
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm start
```
