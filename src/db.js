import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'galla.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS company (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  legal_name TEXT,
  trade_name TEXT,
  gstin TEXT,
  pan TEXT,
  address TEXT,
  location TEXT,
  pincode TEXT,
  state_code TEXT,
  phone TEXT,
  email TEXT,
  bank_name TEXT,
  account_no TEXT,
  ifsc TEXT,
  branch TEXT,
  env TEXT DEFAULT 'sandbox',
  irp_client_id TEXT,
  irp_client_secret TEXT,
  irp_username TEXT,
  irp_password TEXT,
  irp_public_key TEXT,
  ewb_client_id TEXT,
  ewb_client_secret TEXT,
  ewb_username TEXT,
  ewb_password TEXT,
  ewb_public_key TEXT,
  irp_auth_token TEXT,
  irp_sek TEXT,
  irp_app_key TEXT,
  irp_token_expiry TEXT,
  ewb_auth_token TEXT,
  ewb_sek TEXT,
  ewb_app_key TEXT,
  ewb_token_expiry TEXT
);

CREATE TABLE IF NOT EXISTS parties (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  gstin TEXT,
  address TEXT,
  location TEXT,
  pincode TEXT,
  state_code TEXT,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  hsn TEXT,
  unit TEXT DEFAULT 'QTL',
  gst_rate REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL,
  doc_date TEXT NOT NULL,
  party_id INTEGER,
  broker TEXT,
  vehicle_no TEXT,
  distance TEXT,
  driver_name TEXT,
  bilti_no TEXT,
  bilti_date TEXT,
  freight_note TEXT,
  cash_discount REAL DEFAULT 0,
  other_charges REAL DEFAULT 0,
  taxable REAL DEFAULT 0,
  cgst REAL DEFAULT 0,
  sgst REAL DEFAULT 0,
  igst REAL DEFAULT 0,
  round_off REAL DEFAULT 0,
  total REAL DEFAULT 0,
  intra INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft',
  irn TEXT,
  ack_no TEXT,
  ack_date TEXT,
  signed_qr TEXT,
  signed_invoice TEXT,
  ewb_no TEXT,
  ewb_date TEXT,
  ewb_valid_till TEXT,
  portal_info TEXT,
  portal_error TEXT,
  request_json TEXT,
  seller_json TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL,
  item_id INTEGER,
  description TEXT,
  hsn TEXT,
  bags REAL DEFAULT 0,
  qty REAL DEFAULT 0,
  unit TEXT,
  rate REAL DEFAULT 0,
  gst_rate REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  taxable REAL DEFAULT 0,
  cgst REAL DEFAULT 0,
  sgst REAL DEFAULT 0,
  igst REAL DEFAULT 0,
  line_total REAL DEFAULT 0
);
`);

const companyCount = db.prepare('SELECT COUNT(*) AS n FROM company').get().n;
if (!companyCount) {
  db.prepare(`
    INSERT INTO company (
      id, legal_name, trade_name, gstin, pan, address, location, pincode, state_code, phone,
      bank_name, account_no, ifsc, branch, env
    ) VALUES (
      1, 'Abhishek Traders', 'Abhishek Traders', '23AXQPJ6375E1Z9', 'AXQPJ6375E',
      'Vidisha Tiraha, Rahatgarh, Distt. Sagar', 'Rahatgarh', '470119', '23', '8269129464',
      'Central Bank of India', '3803390687', 'CBIN0281891', 'Rahatgarh', 'sandbox'
    )
  `).run();

  db.prepare(`
    INSERT INTO parties (name, gstin, address, location, pincode, state_code, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'KESHAR ENTERPRISE',
    '23CDGPR7584H1Z3',
    '1, new galla mandi, Basoda, Vidisha',
    'Ganjbasoda',
    '464221',
    '23',
    '',
  );

  const insertItem = db.prepare('INSERT INTO items (name, hsn, unit, gst_rate) VALUES (?, ?, ?, ?)');
  insertItem.run('Soyabeen', '12019000', 'QTL', 5);
  insertItem.run('Makka', '10059000', 'QTL', 0);
}

export function getCompany() {
  return db.prepare('SELECT * FROM company WHERE id = 1').get();
}

export function nowStamp() {
  return new Date().toISOString();
}
