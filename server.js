import express from 'express';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { db, getCompany, nowStamp } from './src/db.js';
import { cancelIrn, ensureIrpSession, fetchGstin, generateEwayByIrn, generateIrn, infoText } from './src/irp.js';
import { ensureEwaySession, generateEway } from './src/eway.js';
import { inWords, todayISO } from './src/money.js';
import {
  buildEwayPayload,
  buildNicInvoice,
  cleanGstin,
  cleanVehicle,
  financialYear,
  portalReadiness,
  priceBill,
  stateFromGstin,
  stripEmpty,
  validateDraft,
  STATES,
} from './src/payload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3939;

app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

const COMPANY_FIELDS = [
  'legal_name', 'trade_name', 'gstin', 'pan', 'address', 'location', 'pincode', 'state_code',
  'phone', 'email', 'bank_name', 'account_no', 'ifsc', 'branch', 'env',
  'irp_client_id', 'irp_client_secret', 'irp_username', 'irp_password', 'irp_public_key',
  'ewb_client_id', 'ewb_client_secret', 'ewb_username', 'ewb_password', 'ewb_public_key',
];

function publicCompany(row) {
  const copy = { ...row };
  for (const key of ['irp_auth_token', 'irp_sek', 'irp_app_key', 'ewb_auth_token', 'ewb_sek', 'ewb_app_key']) delete copy[key];
  copy.irp_connected = Boolean(row.irp_auth_token && row.irp_token_expiry);
  copy.irp_token_expiry = row.irp_token_expiry;
  copy.ewb_token_expiry = row.ewb_token_expiry;
  copy.state_name = STATES[row.state_code] || '';
  return copy;
}

function loadParty(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM parties WHERE id = ?').get(id) || null;
}

function loadInvoice(id) {
  const invoice = db.prepare(`
    SELECT i.*, p.name AS party_name, p.gstin AS party_gstin, p.address AS party_address,
           p.location AS party_location, p.pincode AS party_pincode, p.state_code AS party_state,
           p.phone AS party_phone
    FROM invoices i
    LEFT JOIN parties p ON p.id = i.party_id
    WHERE i.id = ?
  `).get(id);
  if (!invoice) return null;
  invoice.lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id').all(id);
  invoice.words = invoice.total ? undefined : undefined;
  return invoice;
}

function bodyFromInvoice(invoice, overrides = {}) {
  return {
    number: invoice.number,
    doc_date: invoice.doc_date,
    party_id: invoice.party_id,
    broker: invoice.broker,
    vehicle_no: overrides.vehicle_no ?? invoice.vehicle_no,
    distance: overrides.distance ?? invoice.distance,
    driver_name: overrides.driver_name ?? invoice.driver_name,
    bilti_no: overrides.bilti_no ?? invoice.bilti_no,
    bilti_date: overrides.bilti_date ?? invoice.bilti_date,
    freight_note: overrides.freight_note ?? invoice.freight_note,
    cash_discount: invoice.cash_discount,
    other_charges: invoice.other_charges,
    lines: invoice.lines.map((line) => ({
      item_id: line.item_id,
      description: line.description,
      hsn: line.hsn,
      bags: line.bags,
      qty: line.qty,
      unit: line.unit,
      rate: line.rate,
      gst_rate: line.gst_rate,
      discount: 0,
    })),
  };
}

function prepare(body) {
  const company = getCompany();
  const party = loadParty(body.party_id);
  const errors = validateDraft(company, party, body);
  const sellerState = company.state_code;
  const buyerState = party?.state_code || stateFromGstin(party?.gstin);
  const priced = priceBill({
    lines: body.lines || [],
    cashDiscount: body.cash_discount,
    otherCharges: body.other_charges,
    sellerState,
    buyerState,
  });
  const readiness = party ? portalReadiness(company, party, priced, body) : {
    einvoice: { ok: false, reason: 'Buyer choose karein.' },
    eway: { ok: false, reason: 'Buyer choose karein.' },
  };
  const nic = party ? stripEmpty(buildNicInvoice(company, party, body, priced)) : null;
  const eway = party ? stripEmpty(buildEwayPayload(company, party, body, priced)) : null;
  return { company, party, errors, priced, readiness, nic, eway };
}

function duplicateNumber(number, docDate, ignoreId) {
  const rows = db.prepare('SELECT id, number, doc_date FROM invoices').all();
  const year = financialYear(docDate);
  return rows.some((row) => row.id !== ignoreId && row.number === number && financialYear(row.doc_date) === year);
}

function writeLines(invoiceId, lines) {
  db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(invoiceId);
  const insert = db.prepare(`
    INSERT INTO invoice_lines (
      invoice_id, item_id, description, hsn, bags, qty, unit, rate, gst_rate, discount,
      taxable, cgst, sgst, igst, line_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of lines) {
    insert.run(
      invoiceId, line.item_id || null, line.description || '', line.hsn || '', line.bags || 0,
      line.qty || 0, line.unit || 'QTL', line.rate || 0, line.gst_rate || 0, line.discount || 0,
      line.taxable || 0, line.cgst || 0, line.sgst || 0, line.igst || 0, line.line_total || 0,
    );
  }
}

function saveInvoice(body, existingId) {
  const built = prepare(body);
  if (built.errors.length) {
    const error = new Error(built.errors[0]);
    error.status = 400;
    error.details = built.errors;
    throw error;
  }
  const number = String(body.number).trim();
  if (duplicateNumber(number, body.doc_date, existingId)) {
    const error = new Error('Is financial year mein yeh bill number pehle se hai.');
    error.status = 400;
    throw error;
  }
  const stamp = nowStamp();
  const seller = {
    legal_name: built.company.legal_name,
    trade_name: built.company.trade_name,
    gstin: built.company.gstin,
    address: built.company.address,
    location: built.company.location,
    pincode: built.company.pincode,
    state_code: built.company.state_code,
    phone: built.company.phone,
    bank_name: built.company.bank_name,
    account_no: built.company.account_no,
    ifsc: built.company.ifsc,
    branch: built.company.branch,
  };
  const fields = {
    number,
    doc_date: body.doc_date,
    party_id: body.party_id,
    broker: body.broker || '',
    vehicle_no: cleanVehicle(body.vehicle_no),
    distance: body.distance === '' || body.distance == null ? '' : String(body.distance),
    driver_name: body.driver_name || '',
    bilti_no: body.bilti_no || '',
    bilti_date: body.bilti_date || '',
    freight_note: body.freight_note || '',
    cash_discount: body.cash_discount || 0,
    other_charges: built.priced.other_charges,
    taxable: built.priced.taxable,
    cgst: built.priced.cgst,
    sgst: built.priced.sgst,
    igst: built.priced.igst,
    round_off: built.priced.round_off,
    total: built.priced.total,
    intra: built.priced.intra ? 1 : 0,
    seller_json: JSON.stringify(seller),
    updated_at: stamp,
  };

  let id = existingId;
  db.exec('BEGIN');
  try {
    if (!id) {
      const result = db.prepare(`
        INSERT INTO invoices (
          number, doc_date, party_id, broker, vehicle_no, distance, driver_name, bilti_no, bilti_date,
          freight_note, cash_discount, other_charges, taxable, cgst, sgst, igst, round_off, total, intra,
          status, seller_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      `).run(
        fields.number, fields.doc_date, fields.party_id, fields.broker, fields.vehicle_no, fields.distance,
        fields.driver_name, fields.bilti_no, fields.bilti_date, fields.freight_note, fields.cash_discount,
        fields.other_charges, fields.taxable, fields.cgst, fields.sgst, fields.igst, fields.round_off,
        fields.total, fields.intra, fields.seller_json, stamp, stamp,
      );
      id = Number(result.lastInsertRowid);
    } else {
      db.prepare(`
        UPDATE invoices SET
          number = ?, doc_date = ?, party_id = ?, broker = ?, vehicle_no = ?, distance = ?,
          driver_name = ?, bilti_no = ?, bilti_date = ?, freight_note = ?, cash_discount = ?,
          other_charges = ?, taxable = ?, cgst = ?, sgst = ?, igst = ?, round_off = ?, total = ?,
          intra = ?, seller_json = ?, updated_at = ?, portal_error = NULL
        WHERE id = ?
      `).run(
        fields.number, fields.doc_date, fields.party_id, fields.broker, fields.vehicle_no, fields.distance,
        fields.driver_name, fields.bilti_no, fields.bilti_date, fields.freight_note, fields.cash_discount,
        fields.other_charges, fields.taxable, fields.cgst, fields.sgst, fields.igst, fields.round_off,
        fields.total, fields.intra, fields.seller_json, stamp, id,
      );
    }
    writeLines(id, built.priced.lines);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return present(id);
}

function present(id) {
  const invoice = loadInvoice(id);
  const company = getCompany();
  const party = loadParty(invoice.party_id);
  const body = bodyFromInvoice(invoice);
  const priced = priceBill({
    lines: body.lines,
    cashDiscount: body.cash_discount,
    otherCharges: body.other_charges,
    sellerState: company.state_code,
    buyerState: party?.state_code || invoice.party_state,
  });
  invoice.words = inWords(invoice.total);
  invoice.readiness = party ? portalReadiness(company, party, priced, body) : null;
  invoice.seller = invoice.seller_json ? JSON.parse(invoice.seller_json) : publicCompany(company);
  return invoice;
}

function asyncRoute(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      const status = error.status || (error.name === 'PortalError' ? 422 : 500);
      console.error(error);
      res.status(status).json({
        error: error.message || 'Server error',
        details: error.details || null,
      });
    });
  };
}

app.get('/api/meta', (req, res) => {
  const company = getCompany();
  res.json({
    states: STATES,
    today: todayISO(),
    env: company.env,
    firm: company.trade_name || company.legal_name,
    gstin: company.gstin,
  });
});

app.get('/api/company', (req, res) => res.json(publicCompany(getCompany())));

app.put('/api/company', (req, res) => {
  const current = getCompany();
  const next = {};
  for (const field of COMPANY_FIELDS) next[field] = req.body[field] == null ? current[field] : String(req.body[field]).trim();
  next.gstin = cleanGstin(next.gstin);
  next.state_code = next.state_code || stateFromGstin(next.gstin);
  next.env = next.env === 'production' ? 'production' : 'sandbox';
  const irpChanged = ['irp_client_id', 'irp_client_secret', 'irp_username', 'irp_password', 'irp_public_key', 'gstin', 'env']
    .some((field) => next[field] !== (field === 'gstin' ? cleanGstin(current.gstin) : current[field] || ''));
  const ewbChanged = ['ewb_client_id', 'ewb_client_secret', 'ewb_username', 'ewb_password', 'ewb_public_key', 'gstin', 'env']
    .some((field) => next[field] !== (current[field] || ''));
  const assignments = COMPANY_FIELDS.map((field) => `${field} = ?`).join(', ');
  const values = COMPANY_FIELDS.map((field) => next[field]);
  let tokenSql = '';
  if (irpChanged) tokenSql += ', irp_auth_token = NULL, irp_sek = NULL, irp_app_key = NULL, irp_token_expiry = NULL';
  if (ewbChanged) tokenSql += ', ewb_auth_token = NULL, ewb_sek = NULL, ewb_app_key = NULL, ewb_token_expiry = NULL';
  db.prepare(`UPDATE company SET ${assignments}${tokenSql} WHERE id = 1`).run(...values);
  res.json(publicCompany(getCompany()));
});

app.post('/api/portal/test-irp', asyncRoute(async (req, res) => {
  const session = await ensureIrpSession(getCompany(), { force: Boolean(req.body.force) });
  res.json({ ok: true, message: 'e-Invoice portal ne login accept kar liya.', expiry: getCompany().irp_token_expiry, url: session.url || '' });
}));

app.post('/api/portal/test-eway', asyncRoute(async (req, res) => {
  const session = await ensureEwaySession(getCompany(), { force: true });
  res.json({ ok: true, message: 'e-Way Bill portal ne login accept kar liya.', expiry: getCompany().ewb_token_expiry, url: session.url || '' });
}));

app.get('/api/parties', (req, res) => {
  res.json(db.prepare('SELECT * FROM parties ORDER BY name').all());
});

app.post('/api/parties', (req, res) => {
  const row = readParty(req.body);
  if (!row.name) return res.status(400).json({ error: 'Party ka naam bharein.' });
  const result = db.prepare(`
    INSERT INTO parties (name, gstin, address, location, pincode, state_code, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(row.name, row.gstin, row.address, row.location, row.pincode, row.state_code, row.phone);
  res.json(db.prepare('SELECT * FROM parties WHERE id = ?').get(Number(result.lastInsertRowid)));
});

app.put('/api/parties/:id', (req, res) => {
  const row = readParty(req.body);
  if (!row.name) return res.status(400).json({ error: 'Party ka naam bharein.' });
  db.prepare(`
    UPDATE parties SET name = ?, gstin = ?, address = ?, location = ?, pincode = ?, state_code = ?, phone = ? WHERE id = ?
  `).run(row.name, row.gstin, row.address, row.location, row.pincode, row.state_code, row.phone, req.params.id);
  res.json(db.prepare('SELECT * FROM parties WHERE id = ?').get(req.params.id));
});

app.delete('/api/parties/:id', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE party_id = ?').get(req.params.id).n;
  if (used) return res.status(400).json({ error: 'Is party ke bill bane hue hain, isliye delete nahi hogi.' });
  db.prepare('DELETE FROM parties WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/parties/lookup', asyncRoute(async (req, res) => {
  const gstin = cleanGstin(req.body.gstin);
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    return res.status(400).json({ error: 'GSTIN 15 character ka sahi format mein likhein.' });
  }
  const result = await fetchGstin(gstin);
  const data = result.data || {};
  const address = [data.AddrBno, data.AddrFlno, data.AddrBnm, data.AddrSt].filter(Boolean).join(', ');
  res.json({
    gstin,
    name: data.TradeName || data.LegalName || '',
    legal_name: data.LegalName || '',
    address,
    location: data.AddrLoc || '',
    pincode: data.AddrPncd ? String(data.AddrPncd) : '',
    state_code: data.StateCode ? String(data.StateCode).padStart(2, '0') : stateFromGstin(gstin),
    status: data.Status || '',
    url: result.url,
  });
}));

app.get('/api/items', (req, res) => res.json(db.prepare('SELECT * FROM items ORDER BY name').all()));

app.post('/api/items', (req, res) => {
  const row = readItem(req.body);
  if (!row.name) return res.status(400).json({ error: 'Maal ka naam bharein.' });
  const result = db.prepare('INSERT INTO items (name, hsn, unit, gst_rate) VALUES (?, ?, ?, ?)').run(row.name, row.hsn, row.unit, row.gst_rate);
  res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(Number(result.lastInsertRowid)));
});

app.put('/api/items/:id', (req, res) => {
  const row = readItem(req.body);
  if (!row.name) return res.status(400).json({ error: 'Maal ka naam bharein.' });
  db.prepare('UPDATE items SET name = ?, hsn = ?, unit = ?, gst_rate = ? WHERE id = ?').run(row.name, row.hsn, row.unit, row.gst_rate, req.params.id);
  res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id));
});

app.delete('/api/items/:id', (req, res) => {
  db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/invoices/next-number', (req, res) => {
  const year = financialYear(todayISO());
  const rows = db.prepare('SELECT number, doc_date FROM invoices').all();
  let max = 0;
  for (const row of rows) {
    if (financialYear(row.doc_date) !== year) continue;
    if (/^\d+$/.test(row.number)) max = Math.max(max, Number(row.number));
  }
  res.json({ number: String(max + 1), financial_year: year });
});

app.get('/api/invoices', (req, res) => {
  const rows = db.prepare(`
    SELECT i.id, i.number, i.doc_date, i.total, i.status, i.irn, i.ewb_no, i.portal_error, p.name AS party_name
    FROM invoices i LEFT JOIN parties p ON p.id = i.party_id
    ORDER BY i.id DESC
  `).all();
  res.json(rows);
});

app.post('/api/calculate', (req, res) => {
  const built = prepare(req.body || {});
  res.json({
    errors: built.errors,
    ...built.priced,
    readiness: built.readiness,
    nic: built.nic,
    eway: built.eway,
  });
});

app.post('/api/invoices', (req, res) => {
  try {
    res.json(saveInvoice(req.body));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.details || null });
  }
});

app.get('/api/invoices/:id', (req, res) => {
  const invoice = loadInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Bill nahi mili.' });
  res.json(present(req.params.id));
});

app.put('/api/invoices/:id', (req, res) => {
  const invoice = loadInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Bill nahi mili.' });
  if (invoice.status === 'cancelled') return res.status(409).json({ error: 'Cancelled bill badli nahi ja sakti.' });
  if (invoice.irn) {
    if (invoice.ewb_no) return res.status(409).json({ error: 'IRN aur e-way ban chuka hai. Bill lock hai.' });
    db.prepare(`
      UPDATE invoices
      SET vehicle_no = ?, distance = ?, driver_name = ?, bilti_no = ?, bilti_date = ?, broker = ?, freight_note = ?, updated_at = ?
      WHERE id = ?
    `).run(
      cleanVehicle(req.body.vehicle_no),
      req.body.distance == null ? invoice.distance : String(req.body.distance),
      req.body.driver_name || '',
      req.body.bilti_no || '',
      req.body.bilti_date || '',
      req.body.broker || invoice.broker || '',
      req.body.freight_note || invoice.freight_note || '',
      nowStamp(),
      invoice.id,
    );
    return res.json(present(invoice.id));
  }
  try {
    res.json(saveInvoice(req.body, invoice.id));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, details: error.details || null });
  }
});

app.delete('/api/invoices/:id', (req, res) => {
  const invoice = loadInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Bill nahi mili.' });
  if (invoice.irn || invoice.ewb_no) return res.status(409).json({ error: 'Portal par bani bill delete nahi hogi. Cancel use karein.' });
  db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(invoice.id);
  db.prepare('DELETE FROM invoices WHERE id = ?').run(invoice.id);
  res.json({ ok: true });
});

app.get('/api/invoices/:id/payload', (req, res) => {
  const invoice = loadInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Bill nahi mili.' });
  const built = prepare(bodyFromInvoice(invoice));
  res.json({ nic: built.nic, eway: built.eway, readiness: built.readiness, errors: built.errors });
});

app.get('/api/invoices/:id/qr', asyncRoute(async (req, res) => {
  const invoice = loadInvoice(req.params.id);
  if (!invoice?.signed_qr) return res.status(404).end();
  const png = await QRCode.toBuffer(invoice.signed_qr, { errorCorrectionLevel: 'L', margin: 1, width: 220 });
  res.type('png').send(png);
}));

app.post('/api/invoices/:id/einvoice', asyncRoute(async (req, res) => {
  const invoice = loadInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Bill nahi mili.' });
  if (invoice.irn) return res.status(409).json({ error: 'Is bill ka IRN pehle se bana hai.' });
  const built = prepare(bodyFromInvoice(invoice));
  if (built.errors.length) return res.status(400).json({ error: built.errors[0] });
  if (!built.readiness.einvoice.ok) return res.status(400).json({ error: built.readiness.einvoice.reason });
  let result;
  try {
    result = await generateIrn(built.nic);
  } catch (error) {
    db.prepare('UPDATE invoices SET portal_error = ?, request_json = ?, updated_at = ? WHERE id = ?')
      .run(error.message, JSON.stringify(built.nic), nowStamp(), invoice.id);
    throw error;
  }
  const data = result.data || {};
  const info = infoText(result.info);
  db.prepare(`
    UPDATE invoices SET
      status = 'invoiced', irn = ?, ack_no = ?, ack_date = ?, signed_qr = ?, signed_invoice = ?,
      ewb_no = ?, ewb_date = ?, ewb_valid_till = ?, portal_info = ?, portal_error = NULL,
      request_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    data.Irn || '',
    data.AckNo ? String(data.AckNo) : '',
    data.AckDt || '',
    data.SignedQRCode || '',
    data.SignedInvoice || '',
    usable(data.EwbNo),
    data.EwbDt || '',
    data.EwbValidTill || '',
    info,
    JSON.stringify(built.nic),
    nowStamp(),
    invoice.id,
  );
  const saved = present(invoice.id);
  saved.portal_url = result.url;
  res.json(saved);
}));

app.post('/api/invoices/:id/eway', asyncRoute(async (req, res) => {
  let invoice = loadInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Bill nahi mili.' });
  if (invoice.ewb_no) return res.status(409).json({ error: 'e-Way bill pehle se bana hai.' });
  if (invoice.status === 'cancelled') return res.status(409).json({ error: 'Cancelled bill par e-way nahi banega.' });
  if (req.body && (req.body.vehicle_no || req.body.distance != null)) {
    db.prepare(`
      UPDATE invoices SET vehicle_no = ?, distance = ?, bilti_no = ?, bilti_date = ?, driver_name = ?, updated_at = ? WHERE id = ?
    `).run(
      cleanVehicle(req.body.vehicle_no || invoice.vehicle_no),
      req.body.distance == null || req.body.distance === '' ? invoice.distance : String(req.body.distance),
      req.body.bilti_no ?? invoice.bilti_no,
      req.body.bilti_date ?? invoice.bilti_date,
      req.body.driver_name ?? invoice.driver_name,
      nowStamp(),
      invoice.id,
    );
    invoice = loadInvoice(invoice.id);
  }
  const built = prepare(bodyFromInvoice(invoice));
  if (!built.readiness.eway.ok) return res.status(400).json({ error: built.readiness.eway.reason });

  if (invoice.irn) {
    const payload = {
      Irn: invoice.irn,
      Distance: invoice.distance === '' || invoice.distance == null ? 0 : Number(invoice.distance),
      TransMode: '1',
      VehNo: cleanVehicle(invoice.vehicle_no),
      VehType: 'R',
    };
    if (invoice.bilti_no) {
      payload.TransDocNo = invoice.bilti_no;
      const { toNicDate } = await import('./src/money.js');
      payload.TransDocDt = toNicDate(invoice.bilti_date || invoice.doc_date);
    }
    let result;
    try {
      result = await generateEwayByIrn(payload);
    } catch (error) {
      db.prepare('UPDATE invoices SET portal_error = ?, updated_at = ? WHERE id = ?').run(error.message, nowStamp(), invoice.id);
      throw error;
    }
    const data = result.data || {};
    db.prepare(`
      UPDATE invoices SET ewb_no = ?, ewb_date = ?, ewb_valid_till = ?, portal_info = ?, portal_error = NULL, updated_at = ? WHERE id = ?
    `).run(usable(data.EwbNo), data.EwbDt || '', data.EwbValidTill || '', infoText(result.info), nowStamp(), invoice.id);
    const saved = present(invoice.id);
    saved.portal_url = result.url;
    return res.json(saved);
  }

  let result;
  try {
    result = await generateEway(built.eway);
  } catch (error) {
    db.prepare('UPDATE invoices SET portal_error = ?, request_json = ?, updated_at = ? WHERE id = ?')
      .run(error.message, JSON.stringify(built.eway), nowStamp(), invoice.id);
    throw error;
  }
  const data = result.data || {};
  db.prepare(`
    UPDATE invoices
    SET status = 'eway', ewb_no = ?, ewb_date = ?, ewb_valid_till = ?, request_json = ?, portal_error = NULL, updated_at = ?
    WHERE id = ?
  `).run(
    usable(data.ewayBillNo),
    data.ewayBillDate || '',
    data.validUpto || '',
    JSON.stringify(built.eway),
    nowStamp(),
    invoice.id,
  );
  const saved = present(invoice.id);
  saved.portal_url = result.url;
  res.json(saved);
}));

app.post('/api/invoices/:id/cancel', asyncRoute(async (req, res) => {
  const invoice = loadInvoice(req.params.id);
  if (!invoice?.irn) return res.status(400).json({ error: 'Is bill par IRN nahi hai.' });
  if (invoice.status === 'cancelled') return res.status(409).json({ error: 'Bill pehle se cancel hai.' });
  const reason = String(req.body.reason || '2');
  const remark = String(req.body.remark || '').trim();
  if (!remark) return res.status(400).json({ error: 'Cancel ka reason likhein.' });
  const result = await cancelIrn({ Irn: invoice.irn, CnlRsn: reason, CnlRem: remark });
  db.prepare(`
    UPDATE invoices SET status = 'cancelled', portal_info = ?, portal_error = NULL, updated_at = ? WHERE id = ?
  `).run(infoText(result.info) || 'Cancelled on IRP', nowStamp(), invoice.id);
  const saved = present(invoice.id);
  saved.portal_url = result.url;
  res.json(saved);
}));

function readParty(body) {
  const gstin = cleanGstin(body.gstin);
  return {
    name: String(body.name || '').trim(),
    gstin,
    address: String(body.address || '').trim(),
    location: String(body.location || '').trim(),
    pincode: String(body.pincode || '').trim(),
    state_code: String(body.state_code || stateFromGstin(gstin) || '').trim(),
    phone: String(body.phone || '').trim(),
  };
}

function readItem(body) {
  return {
    name: String(body.name || '').trim(),
    hsn: String(body.hsn || '').trim(),
    unit: String(body.unit || 'QTL').trim().toUpperCase() || 'QTL',
    gst_rate: Number(body.gst_rate || 0),
  };
}

function usable(value) {
  if (value == null) return '';
  const text = String(value);
  if (!text || text === 'null' || text === '0') return '';
  return text;
}

app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Galla Bill ${url}`);
  if (process.env.NO_BROWSER !== '1') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} pehle se chal raha hai. Browser mein http://127.0.0.1:${port} kholein.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
