import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const file = process.env.GALLA_DB || path.join(dataDir, 'erp.db');
export const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const SECRET = process.env.GALLA_JWT_SECRET || 'dev-galla-erp-node-change-before-production';

export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function tx(work) {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* already closed */ }
    throw error;
  }
}

export function camel(row) {
  if (!row) return null;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  return out;
}

export function rows(list) {
  return list.map((row) => camel(row));
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function checkPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const current = Buffer.from(hash, 'hex');
  return current.length === next.length && timingSafeEqual(current, next);
}

export function signToken(user) {
  const body = Buffer.from(JSON.stringify({
    uid: user.id,
    cid: user.company_id,
    sub: user.username,
    roles: user.roles || [],
    exp: Date.now() + 12 * 60 * 60 * 1000,
  })).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Date.now()) return null;
  return payload;
}

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  legal_name TEXT, trade_name TEXT, gstin TEXT, pan TEXT, address TEXT, city TEXT, pincode TEXT,
  state_name TEXT, state_code TEXT, phone TEXT, email TEXT, bank_name TEXT, account_no TEXT, ifsc TEXT, branch TEXT,
  gst_env TEXT DEFAULT 'SANDBOX', allow_negative_stock INTEGER DEFAULT 0,
  irp_client_id TEXT, irp_client_secret TEXT, irp_username TEXT, irp_password TEXT, irp_public_key TEXT,
  irp_auth_token TEXT, irp_sek TEXT, irp_token_expiry TEXT,
  ewb_client_id TEXT, ewb_client_secret TEXT, ewb_username TEXT, ewb_password TEXT, ewb_public_key TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL, full_name TEXT, username TEXT UNIQUE, password_hash TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS user_roles (user_id INTEGER, role_name TEXT, PRIMARY KEY (user_id, role_name));
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT, address TEXT, city TEXT, pincode TEXT, gstin TEXT,
  state_name TEXT, state_code TEXT, mobile TEXT, email TEXT, opening_balance REAL DEFAULT 0, credit_limit REAL DEFAULT 0,
  payment_terms TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT, address TEXT, city TEXT, pincode TEXT, gstin TEXT,
  state_name TEXT, state_code TEXT, mobile TEXT, email TEXT, opening_balance REAL DEFAULT 0, credit_limit REAL DEFAULT 0,
  payment_terms TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS hsn_codes (
  id INTEGER PRIMARY KEY, company_id INTEGER, code TEXT, description TEXT, gst_rate REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT, hsn_code TEXT, unit TEXT DEFAULT 'QTL', gst_rate REAL DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT, address TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS transporters (
  id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT, gstin TEXT, mobile TEXT, address TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY, company_id INTEGER, vehicle_no TEXT, owner_name TEXT, transporter_id INTEGER, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT, mobile TEXT, licence_no TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS brokers (
  id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT, mobile TEXT, commission_rate REAL DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT, direct_cost INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY, company_id INTEGER, code TEXT, name TEXT, account_type TEXT, bank_account INTEGER DEFAULT 0,
  account_number TEXT, ifsc TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS number_sequences (
  company_id INTEGER, name TEXT, fy TEXT, last_value INTEGER DEFAULT 0, PRIMARY KEY (company_id, name, fy)
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY, company_id INTEGER, supplier_id INTEGER, warehouse_id INTEGER, broker_id INTEGER,
  doc_no TEXT, doc_date TEXT, status TEXT, taxable REAL DEFAULT 0, cgst REAL DEFAULT 0, sgst REAL DEFAULT 0, igst REAL DEFAULT 0,
  expense_total REAL DEFAULT 0, supplier_amount REAL DEFAULT 0, total_cost REAL DEFAULT 0, advance REAL DEFAULT 0, remarks TEXT
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY, purchase_id INTEGER, product_id INTEGER, bags REAL DEFAULT 0, gross_qtl REAL DEFAULT 0, tare_qtl REAL DEFAULT 0,
  net_qtl REAL DEFAULT 0, rate REAL DEFAULT 0, gst_rate REAL DEFAULT 0, taxable REAL DEFAULT 0, cgst REAL DEFAULT 0, sgst REAL DEFAULT 0, igst REAL DEFAULT 0,
  expense_share REAL DEFAULT 0, cost_per_qtl REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS purchase_expenses (
  id INTEGER PRIMARY KEY, purchase_id INTEGER, category_id INTEGER, description TEXT, amount REAL DEFAULT 0, settlement TEXT
);
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY, company_id INTEGER, customer_id INTEGER, warehouse_id INTEGER, broker_id INTEGER,
  doc_no TEXT, doc_date TEXT, status TEXT, vehicle_no TEXT, driver_name TEXT, driver_mobile TEXT,
  taxable REAL DEFAULT 0, cgst REAL DEFAULT 0, sgst REAL DEFAULT 0, igst REAL DEFAULT 0, discount REAL DEFAULT 0,
  round_off REAL DEFAULT 0, total REAL DEFAULT 0, advance REAL DEFAULT 0, remarks TEXT
);
CREATE TABLE IF NOT EXISTS sales_items (
  id INTEGER PRIMARY KEY, sales_id INTEGER, product_id INTEGER, bags REAL DEFAULT 0, quantity_qtl REAL DEFAULT 0, rate REAL DEFAULT 0,
  hsn_code TEXT, gst_rate REAL DEFAULT 0, discount REAL DEFAULT 0, taxable REAL DEFAULT 0, cgst REAL DEFAULT 0, sgst REAL DEFAULT 0,
  igst REAL DEFAULT 0, line_total REAL DEFAULT 0, cogs REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS dispatches (
  id INTEGER PRIMARY KEY, company_id INTEGER, sales_id INTEGER, dispatch_date TEXT, status TEXT, destination TEXT, remarks TEXT
);
CREATE TABLE IF NOT EXISTS dispatch_items (
  id INTEGER PRIMARY KEY, dispatch_id INTEGER, sales_item_id INTEGER, product_id INTEGER, bags REAL DEFAULT 0, weight_qtl REAL DEFAULT 0,
  vehicle_no TEXT, driver_name TEXT, driver_mobile TEXT, transporter_id INTEGER, freight REAL DEFAULT 0, loading REAL DEFAULT 0,
  unloading REAL DEFAULT 0, lr_number TEXT, remarks TEXT
);
CREATE TABLE IF NOT EXISTS goods_receipts (
  id INTEGER PRIMARY KEY, dispatch_id INTEGER, dispatch_item_id INTEGER, received_date TEXT, received_qtl REAL DEFAULT 0, remarks TEXT
);
CREATE TABLE IF NOT EXISTS weight_adjustments (
  id INTEGER PRIMARY KEY, company_id INTEGER, dispatch_item_id INTEGER, sales_id INTEGER, customer_id INTEGER, product_id INTEGER,
  dispatch_qtl REAL, received_qtl REAL, shortage_qtl REAL, shortage_percent REAL, rate REAL, claim_amount REAL,
  approved_amount REAL, status TEXT, reason TEXT
);
CREATE TABLE IF NOT EXISTS adjustment_events (
  id INTEGER PRIMARY KEY, adjustment_id INTEGER, action TEXT, amount REAL, note TEXT, username TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, company_id INTEGER, category_id INTEGER, expense_date TEXT, amount REAL, pay_mode TEXT, account_id INTEGER,
  vendor_name TEXT, vehicle_no TEXT, purchase_id INTEGER, sales_id INTEGER, dispatch_id INTEGER, remarks TEXT
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, company_id INTEGER, payment_type TEXT, party_type TEXT, party_id INTEGER, account_id INTEGER,
  pay_date TEXT, amount REAL, pay_mode TEXT, purchase_id INTEGER, sales_id INTEGER, remarks TEXT
);
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY, company_id INTEGER, entry_date TEXT, voucher_no TEXT, ref_type TEXT, ref_id INTEGER, narration TEXT, reversed INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY, entry_id INTEGER, account_id INTEGER, party_type TEXT, party_id INTEGER, debit REAL DEFAULT 0, credit REAL DEFAULT 0, note TEXT
);
CREATE TABLE IF NOT EXISTS stock_ledger (
  id INTEGER PRIMARY KEY, company_id INTEGER, product_id INTEGER, warehouse_id INTEGER, purchase_item_id INTEGER,
  qty_kg REAL, value_amount REAL, ref_type TEXT, ref_id INTEGER
);
CREATE TABLE IF NOT EXISTS einvoice_records (
  id INTEGER PRIMARY KEY, company_id INTEGER, sales_id INTEGER, status TEXT, irn TEXT, ack_no TEXT, ack_date TEXT,
  signed_qr TEXT, portal_message TEXT, request_json TEXT, irn_invented INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY, company_id INTEGER, username TEXT, action TEXT, ref_type TEXT, ref_id INTEGER, note TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS eway_records (
  id INTEGER PRIMARY KEY, company_id INTEGER, sales_id INTEGER, status TEXT, eway_no TEXT, eway_date TEXT,
  valid_upto TEXT, portal_message TEXT, request_json TEXT, invented INTEGER DEFAULT 0
);
`);

function ensureColumn(table, name, type) {
  const names = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
  if (!names.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
}
for (const [name, type] of [
  ['broker', 'TEXT'], ['place', 'TEXT'], ['bilti_no', 'TEXT'], ['bilti_date', 'TEXT'],
  ['transporter_name', 'TEXT'], ['freight_note', 'TEXT'], ['distance', 'REAL'], ['cash_discount', 'REAL DEFAULT 0'],
]) ensureColumn('sales', name, type);
for (const name of ['ewb_auth_token', 'ewb_sek', 'ewb_token_expiry']) ensureColumn('companies', name, 'TEXT');
db.prepare(`UPDATE companies SET address = ? WHERE address = ?`).run(
  'पशु चिकित्सालय के सामने, मायू वेल्डिंग के बाजू में विदिशा रोड़, राहतगढ़',
  'Vidisha Tiraha, Rahatgarh, Distt. Sagar',
);

const companyCount = db.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
if (companyCount === 0) {
  db.exec(`
    INSERT INTO companies (legal_name, trade_name, gstin, pan, address, city, pincode, state_name, state_code, phone, bank_name, account_no, ifsc, branch, gst_env)
    VALUES ('Abhishek Traders', 'Abhishek Traders', '23AXQPJ6375E1Z9', 'AXQPJ6375E',
      'Vidisha Tiraha, Rahatgarh, Distt. Sagar', 'Rahatgarh', '470119', 'Madhya Pradesh', '23',
      '8269129464', 'Central Bank of India', '3803390687', 'CBIN0281891', 'Rahatgarh', 'SANDBOX');
  `);
  const accounts = [
    ['1000', 'Cash', 'ASSET', 0], ['1010', 'Central Bank of India', 'ASSET', 1],
    ['1100', 'Customer Receivables', 'ASSET', 0], ['1200', 'Inventory', 'ASSET', 0],
    ['1300', 'Input CGST', 'ASSET', 0], ['1310', 'Input SGST', 'ASSET', 0], ['1320', 'Input IGST', 'ASSET', 0],
    ['2000', 'Supplier Payables', 'LIABILITY', 0], ['2100', 'Output CGST', 'LIABILITY', 0],
    ['2110', 'Output SGST', 'LIABILITY', 0], ['2120', 'Output IGST', 'LIABILITY', 0],
    ['3000', 'Capital', 'EQUITY', 0], ['4000', 'Sales', 'INCOME', 0], ['5000', 'Cost of Goods Sold', 'EXPENSE', 0],
    ['5100', 'Weight Shortage Loss', 'EXPENSE', 0], ['5200', 'Direct Expenses', 'EXPENSE', 0],
    ['5300', 'Indirect Expenses', 'EXPENSE', 0], ['5400', 'Round Off', 'EXPENSE', 0],
  ];
  const insertAccount = db.prepare('INSERT INTO accounts (company_id, code, name, account_type, bank_account, account_number, ifsc) VALUES (1, ?, ?, ?, ?, ?, ?)');
  for (const [code, name, type, bank] of accounts) {
    insertAccount.run(code, name, type, bank, code === '1010' ? '3803390687' : null, code === '1010' ? 'CBIN0281891' : null);
  }
  const insertHsn = db.prepare('INSERT INTO hsn_codes (company_id, code, description, gst_rate) VALUES (1, ?, ?, ?)');
  const insertProduct = db.prepare('INSERT INTO products (company_id, name, hsn_code, unit, gst_rate) VALUES (1, ?, ?, ?, ?)');
  for (const [code, name, rate] of [['12019000', 'Soyabeen', 5], ['10059000', 'Makka', 0], ['10019910', 'Wheat', 0], ['10063010', 'Rice', 5], ['12075090', 'Mustard', 5]]) {
    insertHsn.run(code, name, rate);
    insertProduct.run(name, code, 'QTL', rate);
  }
  db.prepare(`INSERT INTO warehouses (company_id, name, address) VALUES (1, 'Rahatgarh Godown', 'Vidisha Tiraha, Rahatgarh')`).run();
  db.prepare(`INSERT INTO customers (company_id, name, address, city, pincode, gstin, state_name, state_code, mobile, credit_limit, payment_terms)
    VALUES (1, 'KESHAR ENTERPRISE', '1, new galla mandi, Basoda, Vidisha', 'Ganjbasoda', '464221', '23CDGPR7584H1Z3', 'Madhya Pradesh', '23', '9000000001', 2000000, '7 days')`).run();
  db.prepare(`INSERT INTO suppliers (company_id, name, address, city, pincode, state_name, state_code, mobile, payment_terms)
    VALUES (1, 'Mandi Purchase - Rahatgarh', 'Galla mandi, Rahatgarh', 'Rahatgarh', '470119', 'Madhya Pradesh', '23', '9000000002', 'Immediate')`).run();
  db.prepare(`INSERT INTO transporters (company_id, name, mobile) VALUES (1, 'Local Transport', '9000000003')`).run();
  db.prepare(`INSERT INTO vehicles (company_id, vehicle_no, transporter_id) VALUES (1, 'RJ09GC7788', 1)`).run();
  db.prepare(`INSERT INTO drivers (company_id, name, mobile) VALUES (1, 'Ramesh', '9000000004')`).run();
  db.prepare(`INSERT INTO brokers (company_id, name, mobile, commission_rate) VALUES (1, 'Mandi Broker', '9000000005', 0.5)`).run();
  const insertCategory = db.prepare('INSERT INTO expense_categories (company_id, name, direct_cost) VALUES (1, ?, ?)');
  for (const [name, direct] of [['Transportation', 1], ['Diesel', 1], ['Loading', 1], ['Unloading', 1], ['Hamali', 1], ['Labour', 1], ['Mandi Tax', 1], ['Broker Commission', 1], ['Weighing Charges', 1], ['Godown Rent', 0], ['Packaging', 1], ['Repair and Maintenance', 0], ['Other Expenses', 0]]) {
    insertCategory.run(name, direct);
  }
}
