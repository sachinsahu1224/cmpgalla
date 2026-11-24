# Abhishek Traders — Grain Trading ERP

## Phase 1 — React, Node, PostgreSQL

Login, company, customers, products, HSN, and sales invoices. Architecture is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The API is in [docs/API.md](docs/API.md).

```powershell
cd d:\project\gallasoftware\server
npm test
npm run dev
```

```powershell
cd d:\project\gallasoftware\web
npm run dev
```

Open http://localhost:5173 and sign in with `admin` / `Admin@123`. The billing screens are login, dashboard, create invoice, preview, e-invoice, e-way bill, documents, history, and company settings. This UI keeps its demo bills in the browser. A simulated portal result is marked **MOCK / TEST ONLY** and has no IRN, signed QR, or e-way number.

The API listens on port 4000. `npm test` and `npm run dev` start a local PostgreSQL. `server/docker-compose.yml` is there for a machine that has Docker.

Sales invoices, tax calculation, a printable PDF, and the e-invoice / e-way adapters are in this build. Mock mode is the default. It prepares the government payload and shows **MOCK / TEST ONLY**. It does not create an IRN, acknowledgement, or government QR. Sandbox calls run only after the portal credentials are saved on the company. Production calls stay off unless `GST_PRODUCTION_ENABLED=true`.

Purchase, stock, and accounts stay in Phase 2.

The test database is separate from the app database. `npm test` checks the soyabeen total of ₹14,85,721.00, the makka total of ₹6,30,579.00, quintal-to-kg conversion, shortage and bardana applied once, and that a mock e-invoice has no IRN.

## Deploy

Set `DATABASE_URL` and `JWT_SECRET`. Leave `GST_PRODUCTION_ENABLED` unset so production portal calls stay off. The API reads `PORT` and listens on `0.0.0.0` unless `HOST` is set. From `server`, run `npx prisma migrate deploy` and `npm run build`. From `web`, set `VITE_API_URL` to the public API origin (no trailing slash) and run `npm run build`. An empty `VITE_API_URL` keeps `/api` on the same host, which is what the local Vite proxy uses. Serve `web/dist` over HTTPS. Portal credentials stay on the server. The company screen never receives the stored secrets.
