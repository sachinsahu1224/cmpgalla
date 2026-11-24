# Phase 1A API

Base URL `http://127.0.0.1:4000`. Every route except health and login requires `Authorization: Bearer <token>`. Writes require the `SUPER_ADMIN` or `ADMIN` role. Errors are `{ "error": "message" }`.

Money fields are decimal strings with two places, for example `"0.00"`.

## Health and login

`GET /api/health` → `{ "ok": true }`

`POST /api/auth/login`

```json
{ "username": "admin", "password": "Admin@123" }
```

Returns `{ token, user: { id, fullName, username, roles, companyId } }`. A wrong password is `401`.

`GET /api/auth/me` returns the signed-in user and `companyName`.

## Dashboard

`GET /api/summary`

```json
{ "companyName": "Abhishek Traders", "gstin": "23AXQPJ6375E1Z9", "gstEnv": "SANDBOX", "integrationMode": "MOCK", "customers": 1, "products": 2, "hsnCodes": 5, "invoices": 0 }
```

Counts are active customers, active products, HSN rows, and sales invoices.

## Company

`GET /api/company`

Returns the legal name, GSTIN, address, bank, `gstEnv` (`SANDBOX` or `PRODUCTION`), `integrationMode` (`MOCK`, `SANDBOX`, or `PRODUCTION`), shortage mode, bardana mode, bardana rate, and the e-invoice and e-way client ids and usernames. Secrets are not returned. The response includes `irpPasswordSet`, `irpClientSecretSet`, `irpPublicKeySet`, `ewbPasswordSet`, `ewbClientSecretSet`, and `ewbPublicKeySet`.

`PUT /api/company` accepts the same business fields plus the credential fields. A blank secret, password, or public key leaves the stored value in place. `integrationMode: "PRODUCTION"` is rejected with `400` unless `GST_PRODUCTION_ENABLED=true`.

## Customers

`GET /api/customers?search=` matches name, GSTIN, or city.

`POST /api/customers` and `PUT /api/customers/:id`

```json
{
  "name": "JK TRADERS",
  "address": "Ganibasoda",
  "city": "Ganjbasoda",
  "pincode": "464221",
  "gstin": "23DUPPR1827A1ZQ",
  "stateName": "Madhya Pradesh",
  "stateCode": "23",
  "mobile": "",
  "email": "",
  "openingBalance": "0.00",
  "creditLimit": "0.00",
  "paymentTerms": "",
  "active": true
}
```

GSTIN may be empty. A value that is not 15 characters in GSTIN form is `400`. Deactivate by sending `active: false`. Rows are not deleted.

## Products and HSN

`GET /api/hsn` returns the codes and rates. `POST /api/hsn` and `PUT /api/hsn/:id` add or edit a code. A duplicate code is `409`. Products must pick one of these rows, and the invoice GST rate comes from the HSN master.

`GET /api/products?search=`

`POST /api/products` and `PUT /api/products/:id`

```json
{ "name": "Gehun", "unit": "QTL", "hsnId": 3, "active": true }
```

`unit` is `QTL`, `BAG`, `KGS`, `MTS`, or `NOS`. The saved `gstRate` is copied from the HSN row.

## Sales invoices

`POST /api/invoices/preview` prices a bill and does not save it.

`GET /api/invoices`, `POST /api/invoices`, `GET /api/invoices/:id`, `PUT /api/invoices/:id`

Quantity and rate are in `KG` or `QTL` (1 quintal = 100 kg). The company shortage mode is `QUANTITY` or `AMOUNT`, and the bardana mode is `NONE`, `PER_BAG`, or `FLAT`. A saved invoice keeps the modes it was priced with. Intra-state (place of supply equals the company state) splits GST into CGST and SGST. Inter-state uses IGST. The total is rounded to the nearest rupee.

A blank invoice number becomes the next number for that financial year (April–March), unique per company. `PUT` of a final invoice is `409`.

`POST /api/invoices/:id/finalise` locks the bill.

`GET /api/invoices/:id/pdf` returns `application/pdf`.

## e-Invoice and e-way

`POST /api/invoices/:id/einvoice` and `POST /api/invoices/:id/eway` run only after the invoice is final. The company `integrationMode` selects the adapter.

- `MOCK` stores the request, sets status `MOCK`, and leaves IRN, acknowledgement, e-way number, and signed QR empty. The message contains `MOCK / TEST ONLY`.
- `SANDBOX` calls the NIC sandbox only when the backend credentials are complete. Otherwise the status is `NOT_SENT` and nothing is invented.
- `PRODUCTION` sends nothing unless `GST_PRODUCTION_ENABLED=true`.

A second click returns the existing record. A click while a request is `PENDING` is `409`. Exempt goods (no positive GST rate) are `NOT_APPLICABLE` for e-invoice. An e-way bill at or below ₹50,000 is `NOT_APPLICABLE`.

`POST /api/invoices/:id/einvoice/cancel` body `{ "reason": "2", "remark": "Data entry mistake" }`. A real IRN can be cancelled only within 24 hours of the acknowledgement, and only through the portal. A mock record is marked cancelled locally and says the portal was not contacted.

`POST /api/invoices/:id/eway/cancel` uses the same reason body. `POST /api/invoices/:id/eway/vehicle` body `{ "vehicleNo", "reason", "remark" }` updates a vehicle only when the portal has returned an e-way number.

The API does not invent an IRN, acknowledgement number, e-way number, or government QR. Purchase, stock, and accounts are not in this API.
