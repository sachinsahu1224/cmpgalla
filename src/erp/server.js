import express from 'express';
import { deflateRawSync } from 'node:zlib';
import { inWords } from '../money.js';
import { checkPassword, db, fail, readToken, rows, signToken } from './db.js';
import {
  cancelPurchase, cancelSale, commodityProfit, createDispatch, dashboard, decideAdjustment, documents,
  ledger, listOwned, own, postPurchase, postSale, receiveGoods, saleWords, saveExpense, savePayment,
  savePurchase, saveSale, seedDemo, stockReport, trialBalance,
} from './books.js';
import { generate, generateEway, preview } from './gst.js';
import { getBill, listBills, saveBill } from './bill.js';

seedDemo();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:4200');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const MASTERS = {
  customers: ['name', 'address', 'city', 'pincode', 'gstin', 'stateName', 'stateCode', 'mobile', 'email', 'openingBalance', 'creditLimit', 'paymentTerms', 'active'],
  suppliers: ['name', 'address', 'city', 'pincode', 'gstin', 'stateName', 'stateCode', 'mobile', 'email', 'openingBalance', 'creditLimit', 'paymentTerms', 'active'],
  products: ['name', 'hsnCode', 'unit', 'gstRate', 'active'],
  hsn: ['code', 'description', 'gstRate'],
  warehouses: ['name', 'address', 'active'],
  transporters: ['name', 'gstin', 'mobile', 'address', 'active'],
  vehicles: ['vehicleNo', 'ownerName', 'transporterId', 'active'],
  drivers: ['name', 'mobile', 'licenceNo', 'active'],
  brokers: ['name', 'mobile', 'commissionRate', 'active'],
  'expense-categories': ['name', 'directCost'],
  accounts: ['code', 'name', 'accountType', 'bankAccount', 'accountNumber', 'ifsc', 'active'],
};
const TABLES = {
  customers: 'customers', suppliers: 'suppliers', products: 'products', hsn: 'hsn_codes', warehouses: 'warehouses',
  transporters: 'transporters', vehicles: 'vehicles', drivers: 'drivers', brokers: 'brokers',
  'expense-categories': 'expense_categories', accounts: 'accounts',
};

function snake(key) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function userOf(req) {
  const header = req.headers.authorization || '';
  const payload = header.startsWith('Bearer ') ? readToken(header.slice(7)) : null;
  if (!payload) fail(401, 'Login karein.');
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(payload.uid);
  if (!user) fail(401, 'Login karein.');
  const roles = db.prepare('SELECT role_name FROM user_roles WHERE user_id = ?').all(user.id).map((row) => row.role_name);
  return { id: user.id, companyId: user.company_id, username: user.username, fullName: user.full_name, roles };
}

app.post('/api/auth/login', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.body?.username || '');
  if (!user || !user.active || !checkPassword(req.body?.password || '', user.password_hash)) fail(401, 'Username ya password galat hai.');
  const roles = db.prepare('SELECT role_name FROM user_roles WHERE user_id = ?').all(user.id).map((row) => row.role_name);
  res.json({ token: signToken({ ...user, roles }), name: user.full_name, username: user.username, roles });
});

app.get('/api/auth/me', (req, res) => {
  const user = userOf(req);
  res.json({ name: user.fullName, username: user.username, roles: user.roles, companyId: user.companyId });
});

app.get('/api/bills', (req, res) => res.json(listBills(userOf(req).companyId)));
app.post('/api/bills', (req, res) => res.json(saveBill(userOf(req), req.body || {})));
app.get('/api/bills/:id', (req, res) => res.json(getBill(userOf(req), Number(req.params.id))));
app.post('/api/bills/:id/post', (req, res) => {
  const user = userOf(req);
  postSale(user, Number(req.params.id));
  res.json(getBill(user, Number(req.params.id)));
});
app.post('/api/bills/:id/einvoice', async (req, res, next) => {
  try { res.json(await generate(userOf(req), Number(req.params.id))); } catch (error) { next(error); }
});
app.post('/api/bills/:id/eway', async (req, res, next) => {
  try { res.json(await generateEway(userOf(req), Number(req.params.id))); } catch (error) { next(error); }
});

app.get('/api/masters/:type', (req, res) => {
  const user = userOf(req);
  const table = TABLES[req.params.type];
  if (!table) fail(404, 'Master nahi mila');
  res.json(rows(db.prepare(`SELECT * FROM ${table} WHERE company_id = ? ORDER BY id`).all(user.companyId)));
});

app.post('/api/masters/:type', (req, res) => {
  const user = userOf(req);
  const fields = MASTERS[req.params.type];
  const table = TABLES[req.params.type];
  if (!fields) fail(404, 'Master nahi mila');
  const chosen = fields.filter((field) => req.body?.[field] !== undefined);
  const columns = ['company_id', ...chosen.map(snake)];
  const values = [user.companyId, ...chosen.map((field) => boolish(req.body[field]))];
  const row = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) RETURNING *`).get(...values);
  res.json(rows([row])[0]);
});

app.put('/api/masters/:type/:id', (req, res) => {
  const user = userOf(req);
  const fields = MASTERS[req.params.type];
  const table = TABLES[req.params.type];
  if (!fields) fail(404, 'Master nahi mila');
  const chosen = fields.filter((field) => req.body?.[field] !== undefined);
  if (!chosen.length) return res.json(rows([own(table, Number(req.params.id), user.companyId)])[0]);
  const set = chosen.map((field) => `${snake(field)} = ?`).join(', ');
  db.prepare(`UPDATE ${table} SET ${set} WHERE id = ? AND company_id = ?`).run(...chosen.map((field) => boolish(req.body[field])), Number(req.params.id), user.companyId);
  res.json(rows([own(table, Number(req.params.id), user.companyId)])[0]);
});

app.delete('/api/masters/:type/:id', (req, res) => {
  const user = userOf(req);
  const table = TABLES[req.params.type];
  if (!table) fail(404, 'Master nahi mila');
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
  if (columns.includes('active')) db.prepare(`UPDATE ${table} SET active = 0 WHERE id = ? AND company_id = ?`).run(Number(req.params.id), user.companyId);
  else db.prepare(`DELETE FROM ${table} WHERE id = ? AND company_id = ?`).run(Number(req.params.id), user.companyId);
  res.json({ ok: true });
});

app.get('/api/company', (req, res) => res.json(publicCompany(userOf(req).companyId)));

app.put('/api/company', (req, res) => {
  const user = userOf(req);
  const body = { ...req.body };
  for (const key of ['irpPassword', 'ewbPassword', 'irpPublicKey', 'ewbPublicKey', 'irpClientSecret', 'ewbClientSecret']) {
    if (!body[key]) delete body[key];
  }
  const map = {
    legalName: 'legal_name', tradeName: 'trade_name', gstin: 'gstin', pan: 'pan', address: 'address', city: 'city', pincode: 'pincode',
    stateName: 'state_name', stateCode: 'state_code', phone: 'phone', email: 'email', bankName: 'bank_name', accountNo: 'account_no',
    ifsc: 'ifsc', branch: 'branch', gstEnv: 'gst_env', allowNegativeStock: 'allow_negative_stock',
    irpClientId: 'irp_client_id', irpClientSecret: 'irp_client_secret', irpUsername: 'irp_username', irpPassword: 'irp_password', irpPublicKey: 'irp_public_key',
    ewbClientId: 'ewb_client_id', ewbClientSecret: 'ewb_client_secret', ewbUsername: 'ewb_username', ewbPassword: 'ewb_password', ewbPublicKey: 'ewb_public_key',
  };
  const chosen = Object.keys(map).filter((key) => body[key] !== undefined);
  if (chosen.length) {
    db.prepare(`UPDATE companies SET ${chosen.map((key) => `${map[key]} = ?`).join(', ')} WHERE id = ?`)
      .run(...chosen.map((key) => boolish(body[key])), user.companyId);
  }
  res.json(publicCompany(user.companyId));
});

app.get('/api/purchases', (req, res) => res.json(listOwned('purchases', userOf(req).companyId)));
app.get('/api/purchases/:id', (req, res) => {
  const user = userOf(req);
  const id = Number(req.params.id);
  res.json({
    purchase: rows([own('purchases', id, user.companyId)])[0],
    items: rows(db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(id)),
    expenses: rows(db.prepare('SELECT * FROM purchase_expenses WHERE purchase_id = ?').all(id)),
  });
});
app.post('/api/purchases', (req, res) => res.json(savePurchase(userOf(req), req.body || {})));
app.post('/api/purchases/:id/post', (req, res) => res.json(postPurchase(userOf(req), Number(req.params.id))));
app.post('/api/purchases/:id/cancel', (req, res) => res.json(cancelPurchase(userOf(req), Number(req.params.id))));

app.get('/api/sales', (req, res) => res.json(listOwned('sales', userOf(req).companyId)));
app.get('/api/sales/:id', (req, res) => {
  const user = userOf(req);
  const id = Number(req.params.id);
  res.json({ sale: rows([own('sales', id, user.companyId)])[0], items: rows(db.prepare('SELECT * FROM sales_items WHERE sales_id = ?').all(id)) });
});
app.post('/api/sales', (req, res) => res.json(saveSale(userOf(req), req.body || {})));
app.post('/api/sales/:id/post', (req, res) => res.json(postSale(userOf(req), Number(req.params.id))));
app.post('/api/sales/:id/cancel', (req, res) => res.json(cancelSale(userOf(req), Number(req.params.id))));
app.get('/api/sales/:id/pdf', (req, res) => {
  const user = userOf(req);
  const sale = own('sales', Number(req.params.id), user.companyId);
  const bytes = invoicePdf(sale, user.companyId);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename=invoice-${String(sale.doc_no).replaceAll('/', '-')}.pdf`);
  res.send(bytes);
});
app.get('/api/sales/:id/excel-register', (req, res) => {
  const user = userOf(req);
  const sale = own('sales', Number(req.params.id), user.companyId);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', 'attachment; filename=invoice.xlsx');
  res.send(xlsx([['Doc', 'Date', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'], [sale.doc_no, sale.doc_date, sale.taxable, sale.cgst, sale.sgst, sale.igst, sale.total]]));
});
app.get('/api/sales/:id/whatsapp', (req, res) => {
  const user = userOf(req);
  const sale = own('sales', Number(req.params.id), user.companyId);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(sale.customer_id);
  let phone = String(customer?.mobile || '').replace(/\D/g, '');
  if (phone.length === 10) phone = `91${phone}`;
  const text = `Invoice ${sale.doc_no} dated ${sale.doc_date} amount Rs ${sale.total}. ${saleWords(sale.id)}`;
  res.json({ url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` });
});
app.get('/api/sales/:id/einvoice-preview', (req, res) => res.json(preview(userOf(req), Number(req.params.id))));
app.post('/api/sales/:id/einvoice', async (req, res, next) => {
  try { res.json(await generate(userOf(req), Number(req.params.id))); } catch (error) { next(error); }
});

app.get('/api/dispatches', (req, res) => res.json(listOwned('dispatches', userOf(req).companyId)));
app.get('/api/dispatches/:id', (req, res) => {
  const user = userOf(req);
  const id = Number(req.params.id);
  res.json({
    dispatch: rows([own('dispatches', id, user.companyId)])[0],
    items: rows(db.prepare('SELECT * FROM dispatch_items WHERE dispatch_id = ?').all(id)),
    receipts: rows(db.prepare('SELECT * FROM goods_receipts WHERE dispatch_id = ?').all(id)),
  });
});
app.post('/api/dispatches', (req, res) => res.json(createDispatch(userOf(req), req.body || {})));
app.post('/api/receipts', (req, res) => res.json(receiveGoods(userOf(req), req.body || {})));
app.get('/api/adjustments', (req, res) => res.json(listOwned('weight_adjustments', userOf(req).companyId)));
app.post('/api/adjustments/:id/approve', (req, res) => res.json(decideAdjustment(userOf(req), Number(req.params.id), 'APPROVED', req.body?.approvedAmount, req.body?.note)));
app.post('/api/adjustments/:id/reject', (req, res) => res.json(decideAdjustment(userOf(req), Number(req.params.id), 'REJECTED', null, req.body?.note)));
app.get('/api/adjustments/:id/events', (req, res) => {
  userOf(req);
  res.json(rows(db.prepare('SELECT * FROM adjustment_events WHERE adjustment_id = ? ORDER BY id').all(Number(req.params.id))));
});
app.get('/api/expenses', (req, res) => res.json(listOwned('expenses', userOf(req).companyId)));
app.post('/api/expenses', (req, res) => res.json(saveExpense(userOf(req), req.body || {})));
app.get('/api/payments', (req, res) => res.json(listOwned('payments', userOf(req).companyId)));
app.post('/api/payments', (req, res) => res.json(savePayment(userOf(req), req.body || {})));

app.get('/api/reports/dashboard', (req, res) => {
  const user = userOf(req);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || `${to.slice(0, 7)}-01`;
  res.json(dashboard(user.companyId, from, to));
});
app.get('/api/reports/trial-balance', (req, res) => res.json(trialBalance(userOf(req).companyId, req.query.from, req.query.to)));
app.get('/api/reports/ledger/:partyType/:partyId', (req, res) => {
  userOf(req);
  res.json(ledger(req.params.partyType.toUpperCase(), Number(req.params.partyId)));
});
app.get('/api/reports/stock', (req, res) => res.json(stockReport(userOf(req).companyId)));
app.get('/api/reports/commodity-profit', (req, res) => res.json(commodityProfit(userOf(req).companyId, req.query.from, req.query.to)));
app.get('/api/reports/:kind', (req, res) => res.json(documents(userOf(req).companyId, req.params.kind, req.query.from, req.query.to)));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || 'Request fail' });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, '127.0.0.1', () => {
  console.log(`Galla ERP (Node) http://127.0.0.1:${port}`);
});

function boolish(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  return value;
}

function publicCompany(id) {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  return {
    id: company.id, legalName: company.legal_name, tradeName: company.trade_name, gstin: company.gstin, pan: company.pan,
    address: company.address, city: company.city, pincode: company.pincode, stateName: company.state_name, stateCode: company.state_code,
    phone: company.phone, email: company.email || '', bankName: company.bank_name, accountNo: company.account_no, ifsc: company.ifsc, branch: company.branch,
    gstEnv: company.gst_env, allowNegativeStock: Boolean(company.allow_negative_stock),
    irpClientId: company.irp_client_id || '', irpUsername: company.irp_username || '',
    irpConfigured: Boolean(company.irp_password && company.irp_public_key),
    ewbClientId: company.ewb_client_id || '', ewbUsername: company.ewb_username || '',
    ewbConfigured: Boolean(company.ewb_password && company.ewb_public_key),
  };
}

function invoicePdf(sale, companyId) {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(sale.customer_id);
  const items = db.prepare(`SELECT i.*, p.name FROM sales_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.sales_id = ?`).all(sale.id);
  const lines = [
    company.trade_name, `${company.address}, ${company.city} ${company.pincode}`, `GSTIN ${company.gstin}`,
    `Tax Invoice ${sale.doc_no}  Date ${sale.doc_date}`, `Buyer ${customer?.name || ''}  GSTIN ${customer?.gstin || ''}`,
    `State ${customer?.state_name || ''} Code ${customer?.state_code || ''}`, `Vehicle ${sale.vehicle_no || ''} Driver ${sale.driver_name || ''}`,
    ...items.map((item) => `${item.name} HSN ${item.hsn_code} Bags ${item.bags} Qty ${item.quantity_qtl} Rate ${item.rate} Taxable ${item.taxable}`),
    `CGST ${sale.cgst} SGST ${sale.sgst} IGST ${sale.igst} Round ${sale.round_off}`,
    `Total Rs ${sale.total}`, inWords(sale.total),
    `Bank ${company.bank_name} A/c ${company.account_no} IFSC ${company.ifsc}`,
    'IRN is printed only after the government portal returns it.',
  ];
  return simplePdf(lines);
}

function simplePdf(lines) {
  const text = lines.map((line, index) => `BT /F1 11 Tf 40 ${800 - index * 16} Td (${escapePdf(line)}) Tj ET`).join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${text.length} >> stream\n${text}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function escapePdf(value) {
  return String(value ?? '').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function xlsx(rowsOfCells) {
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsOfCells.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t>${xml(cell)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Invoice" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
  };
  return zipStore(files);
}

function columnName(index) {
  return String.fromCharCode(65 + index);
}

function xml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text));
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(crc32(Buffer.from(text)), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(text), 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    const chunk = Buffer.concat([local, data]);
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(Buffer.from(text)), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(Buffer.byteLength(text), 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    locals.push(chunk);
    centrals.push(central);
    offset += chunk.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ~crc >>> 0;
}
