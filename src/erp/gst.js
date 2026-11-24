import { aesDecrypt, aesEncrypt, buildEwayAuthBody, buildIrpAuthBody, decryptSek, generateAppKey } from '../nic-crypto.js';
import { buildEwayPayload, buildNicInvoice, priceBill, stripEmpty } from '../payload.js';
import { db, fail } from './db.js';
import { own } from './books.js';

const SANDBOX = ['https://einv1api.gstsandbox.nic.in', 'https://einv2api.gstsandbox.nic.in'];
const PRODUCTION = ['https://einvoice1.gst.gov.in', 'https://einvoice2.gst.gov.in'];

const EWAY_SANDBOX = ['https://ewb1api.gstsandbox.nic.in/ewaybillapi/v1.03', 'https://ewb2api.gstsandbox.nic.in/ewaybillapi/v1.03'];
const EWAY_PRODUCTION = ['https://ewb1api.gst.gov.in/ewaybillapi/v1.03', 'https://ewb2api.gst.gov.in/ewaybillapi/v1.03'];

function ready(company) {
  return Boolean(company.irp_client_id && company.irp_client_secret && company.irp_username && company.irp_password && company.irp_public_key);
}

export function preview(user, saleId) {
  const packed = load(user, saleId);
  const payload = governmentInvoice(packed);
  const gst = packed.items.some((item) => Number(item.gst_rate) > 0);
  return {
    mode: ready(packed.company) ? packed.company.gst_env : 'DEMO',
    irnInvented: false,
    message: !gst
      ? 'GST 0 hai. Exempt maal par e-invoice nahi banta. e-Way Bill alag button se banta hai.'
      : ready(packed.company) ? 'Portal credentials saved. Generate NIC ko call karega.' : 'Credentials nahi hain. Koi IRN nahi banega.',
    payload,
  };
}

export async function generate(user, saleId) {
  const packed = load(user, saleId);
  if (packed.sale.status === 'CANCELLED') fail(409, 'Cancelled bill par e-invoice nahi banta.');
  const payload = governmentInvoice(packed);
  const gst = packed.items.some((item) => Number(item.gst_rate) > 0);
  if (!gst) {
    return saveRecord(packed, 'NOT_SENT', { portal_message: 'GST 0 hai. Exempt maal par IRN nahi banta. e-Way Bill alag se banao.', request_json: JSON.stringify(payload) });
  }
  if (!ready(packed.company)) {
    return saveRecord(packed, 'NOT_SENT', { portal_message: 'API credentials nahi hain. IRN nahi bana.', request_json: JSON.stringify(payload) });
  }
  try {
    const result = await sendInvoice(packed.company, payload);
    const data = result.data || {};
    if (!data.Irn) {
      return saveRecord(packed, 'REJECTED', { portal_message: result.message || 'Portal ne IRN nahi diya.', request_json: JSON.stringify(payload) });
    }
    return saveRecord(packed, 'GENERATED', {
      irn: data.Irn, ack_no: data.AckNo ? String(data.AckNo) : '', ack_date: data.AckDt || '', signed_qr: data.SignedQRCode || '',
      portal_message: 'NIC IRP se mila.', request_json: JSON.stringify(payload),
    });
  } catch (error) {
    return saveRecord(packed, 'ERROR', { portal_message: error.message, request_json: JSON.stringify(payload) });
  }
}

export async function generateEway(user, saleId) {
  const packed = load(user, saleId);
  if (packed.sale.status === 'CANCELLED') fail(409, 'Cancelled bill par e-way nahi banta.');
  const payload = governmentEway(packed);
  const creds = packed.company.ewb_client_id && packed.company.ewb_client_secret && packed.company.ewb_username && packed.company.ewb_password && packed.company.ewb_public_key;
  if (!String(packed.sale.vehicle_no || '').trim()) {
    return saveEway(packed, 'NOT_SENT', { portal_message: 'Truck number bharein. e-Way number nahi bana.', request_json: JSON.stringify(payload) });
  }
  if (!creds) {
    return saveEway(packed, 'NOT_SENT', { portal_message: 'e-Way Bill API ki details Company screen par bharein. Number nahi bana.', request_json: JSON.stringify(payload) });
  }
  try {
    const data = await sendEway(packed.company, payload);
    const number = data?.ewayBillNo || data?.eway_bill_no;
    if (!number) return saveEway(packed, 'REJECTED', { portal_message: 'Portal ne e-way number nahi diya.', request_json: JSON.stringify(payload) });
    return saveEway(packed, 'GENERATED', {
      eway_no: String(number), eway_date: data.ewayBillDate || '', valid_upto: data.validUpto || '',
      portal_message: 'e-Way Bill portal se mila.', request_json: JSON.stringify(payload),
    });
  } catch (error) {
    return saveEway(packed, 'ERROR', { portal_message: error.message, request_json: JSON.stringify(payload) });
  }
}

function portalShape(packed) {
  const company = {
    legal_name: packed.company.legal_name,
    trade_name: packed.company.trade_name,
    gstin: packed.company.gstin,
    address: packed.company.address,
    location: packed.company.city,
    pincode: packed.company.pincode,
    state_code: packed.company.state_code,
    phone: packed.company.phone,
    irp_client_id: packed.company.irp_client_id,
    irp_client_secret: packed.company.irp_client_secret,
    irp_username: packed.company.irp_username,
    irp_password: packed.company.irp_password,
    irp_public_key: packed.company.irp_public_key,
    ewb_client_id: packed.company.ewb_client_id,
    ewb_client_secret: packed.company.ewb_client_secret,
    ewb_username: packed.company.ewb_username,
    ewb_password: packed.company.ewb_password,
    ewb_public_key: packed.company.ewb_public_key,
  };
  const party = {
    name: packed.customer?.name,
    gstin: packed.customer?.gstin,
    address: packed.customer?.address,
    location: packed.customer?.city,
    pincode: packed.customer?.pincode,
    state_code: packed.customer?.state_code,
  };
  const body = {
    number: String(packed.sale.doc_no || '').replaceAll('/', '-').slice(0, 16),
    doc_date: packed.sale.doc_date,
    vehicle_no: packed.sale.vehicle_no,
    distance: packed.sale.distance ?? 0,
    bilti_no: packed.sale.bilti_no,
    bilti_date: packed.sale.bilti_date || packed.sale.doc_date,
    lines: packed.items.map((item) => ({
      description: item.name, hsn: item.hsn_code, qty: item.quantity_qtl, unit: 'QTL', rate: item.rate, gst_rate: item.gst_rate, discount: item.discount,
    })),
  };
  const priced = priceBill({ lines: body.lines, sellerState: company.state_code, buyerState: party.state_code });
  return { company, party, body, priced };
}

function governmentInvoice(packed) {
  const shape = portalShape(packed);
  return stripEmpty(buildNicInvoice(shape.company, shape.party, shape.body, shape.priced));
}

function governmentEway(packed) {
  const shape = portalShape(packed);
  return stripEmpty(buildEwayPayload(shape.company, shape.party, shape.body, shape.priced));
}

function load(user, saleId) {
  const sale = own('sales', saleId, user.companyId);
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(user.companyId);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(sale.customer_id);
  const items = db.prepare(`SELECT i.*, p.name FROM sales_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.sales_id = ?`).all(saleId);
  return { sale, company, customer, items };
}

function saveRecord(packed, status, fields) {
  const row = db.prepare(`INSERT INTO einvoice_records (company_id, sales_id, status, irn, ack_no, ack_date, signed_qr, portal_message, request_json, irn_invented)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING *`).get(
    packed.company.id, packed.sale.id, status, fields.irn || null, fields.ack_no || null, fields.ack_date || null,
    fields.signed_qr || null, fields.portal_message || '', fields.request_json || '',
  );
  return { ...row, irnInvented: false };
}

async function sendInvoice(company, payload) {
  const session = await login(company);
  const bases = company.gst_env === 'PRODUCTION' ? PRODUCTION : SANDBOX;
  let last = null;
  for (const base of bases) {
    const response = await fetch(`${base}/eicore/v1.03/Invoice`, {
      method: 'POST',
      headers: headers(company, session.token),
      body: JSON.stringify({ Data: aesEncrypt(JSON.stringify(payload), session.sek) }),
      signal: AbortSignal.timeout(45000),
    });
    const json = await response.json().catch(() => ({}));
    if (String(json.Status ?? json.status) !== '1') {
      last = new Error(json.ErrorDetails ? JSON.stringify(json.ErrorDetails) : 'Portal ne invoice reject kiya.');
      continue;
    }
    const data = JSON.parse(aesDecrypt(json.Data, session.sek).toString('utf8'));
    return { data };
  }
  throw last || new Error('Portal call fail.');
}

async function login(company) {
  if (company.irp_auth_token && company.irp_sek && company.irp_token_expiry && new Date(company.irp_token_expiry).getTime() - Date.now() > 60000) {
    return { token: company.irp_auth_token, sek: Buffer.from(company.irp_sek, 'base64') };
  }
  const appKey = generateAppKey();
  const body = buildIrpAuthBody({ username: company.irp_username, password: company.irp_password, appKey, publicKey: company.irp_public_key, forceRefresh: true });
  const bases = company.gst_env === 'PRODUCTION' ? PRODUCTION : SANDBOX;
  let last = null;
  for (const base of bases) {
    const response = await fetch(`${base}/eivital/v1.04/auth`, {
      method: 'POST', headers: headers(company), body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
    });
    const json = await response.json().catch(() => ({}));
    if (String(json.Status ?? json.status) !== '1' || !json.Data?.AuthToken) {
      last = new Error('e-Invoice login fail.');
      continue;
    }
    const sek = decryptSek(json.Data.Sek, appKey);
    const expiry = json.Data.TokenExpiry ? String(json.Data.TokenExpiry).replace(' ', 'T') : new Date(Date.now() + 55 * 60 * 1000).toISOString();
    db.prepare('UPDATE companies SET irp_auth_token=?, irp_sek=?, irp_token_expiry=? WHERE id=?').run(json.Data.AuthToken, sek.toString('base64'), expiry, company.id);
    return { token: json.Data.AuthToken, sek };
  }
  throw last || new Error('e-Invoice login fail.');
}

function saveEway(packed, status, fields) {
  const row = db.prepare(`INSERT INTO eway_records (company_id, sales_id, status, eway_no, eway_date, valid_upto, portal_message, request_json, invented)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING *`).get(
    packed.company.id, packed.sale.id, status, fields.eway_no || null, fields.eway_date || null, fields.valid_upto || null,
    fields.portal_message || '', fields.request_json || '',
  );
  return { ...row, invented: false };
}

async function sendEway(company, payload) {
  const session = await ewayLogin(company);
  const bases = company.gst_env === 'PRODUCTION' ? EWAY_PRODUCTION : EWAY_SANDBOX;
  let last = null;
  for (const base of bases) {
    const response = await fetch(`${base}/ewayapi`, {
      method: 'POST',
      headers: ewayHeaders(company, session.token),
      body: JSON.stringify({ action: 'GENEWAYBILL', data: aesEncrypt(JSON.stringify(payload), session.sek) }),
      signal: AbortSignal.timeout(45000),
    });
    const json = await response.json().catch(() => ({}));
    if (String(json.status) === '0') {
      last = new Error(json.error ? JSON.stringify(json.error) : 'e-Way portal ne reject kiya.');
      continue;
    }
    let data = json.data;
    if (typeof data === 'string') data = JSON.parse(aesDecrypt(data, session.sek).toString('utf8'));
    if (data?.ewayBillNo) return data;
    last = new Error('e-Way portal ne number nahi diya.');
  }
  throw last || new Error('e-Way portal call fail.');
}

async function ewayLogin(company) {
  if (company.ewb_auth_token && company.ewb_sek && company.ewb_token_expiry && new Date(company.ewb_token_expiry).getTime() - Date.now() > 60000) {
    return { token: company.ewb_auth_token, sek: Buffer.from(company.ewb_sek, 'base64') };
  }
  const appKey = generateAppKey();
  const body = buildEwayAuthBody({ username: company.ewb_username, password: company.ewb_password, appKey, publicKey: company.ewb_public_key });
  const bases = company.gst_env === 'PRODUCTION' ? EWAY_PRODUCTION : EWAY_SANDBOX;
  let last = null;
  for (const base of bases) {
    const response = await fetch(`${base}/Auth`, {
      method: 'POST', headers: ewayHeaders(company), body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
    });
    const json = await response.json().catch(() => ({}));
    if (String(json.status) !== '1' || !json.authtoken) {
      last = new Error('e-Way login fail.');
      continue;
    }
    const sek = decryptSek(json.sek, appKey);
    const expiry = new Date(Date.now() + 350 * 60 * 1000).toISOString();
    db.prepare('UPDATE companies SET ewb_auth_token=?, ewb_sek=?, ewb_token_expiry=? WHERE id=?').run(json.authtoken, sek.toString('base64'), expiry, company.id);
    return { token: json.authtoken, sek };
  }
  throw last || new Error('e-Way login fail.');
}

function ewayHeaders(company, token) {
  const value = {
    'Content-Type': 'application/json',
    'client-id': company.ewb_client_id,
    'client-secret': company.ewb_client_secret,
    client_id: company.ewb_client_id,
    client_secret: company.ewb_client_secret,
    gstin: company.gstin,
  };
  if (token) value.authtoken = token;
  return value;
}

function headers(company, token) {
  const value = {
    'Content-Type': 'application/json',
    client_id: company.irp_client_id,
    client_secret: company.irp_client_secret,
    'client-id': company.irp_client_id,
    'client-secret': company.irp_client_secret,
    gstin: company.gstin,
  };
  if (token) {
    value.AuthToken = token;
    value.user_name = company.irp_username;
  }
  return value;
}
