import { db, getCompany } from './db.js';
import { aesDecrypt, aesEncrypt, buildIrpAuthBody, decryptSek, generateAppKey } from './nic-crypto.js';

const SANDBOX = ['https://einv1api.gstsandbox.nic.in', 'https://einv2api.gstsandbox.nic.in'];
const PRODUCTION = ['https://einvoice1.gst.gov.in', 'https://einvoice2.gst.gov.in'];

function bases(env) {
  return env === 'production' ? PRODUCTION : SANDBOX;
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

function describeError(payload) {
  if (!payload) return 'Portal se khaali jawab aaya.';
  if (typeof payload === 'string') return payload;
  const parts = [];
  for (const key of ['error', 'Error', 'status_desc', 'message']) {
    if (payload[key]) parts.push(typeof payload[key] === 'string' ? payload[key] : JSON.stringify(payload[key]));
  }
  const details = payload.ErrorDetails || payload.errorDetails;
  if (Array.isArray(details)) {
    for (const item of details) {
      parts.push([item.ErrorCode || item.errorCode, item.ErrorMessage || item.errorMessage].filter(Boolean).join(': '));
    }
  } else if (details) {
    parts.push(typeof details === 'string' ? details : JSON.stringify(details));
  }
  const info = payload.InfoDtls || payload.info;
  if (Array.isArray(info)) {
    for (const item of info) parts.push([item.InfCd, item.Desc].filter(Boolean).join(': '));
  }
  return parts.filter(Boolean).join(' | ') || JSON.stringify(payload);
}

async function postJson(url, headerBag, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: headerBag,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { error: text.slice(0, 500) }; }
  return { response, json, text };
}

export async function irpRequest(path, plainBody, { method = 'POST' } = {}) {
  const company = getCompany();
  const session = await ensureIrpSession(company);
  const encrypted = plainBody == null ? null : { Data: aesEncrypt(JSON.stringify(plainBody), session.sek) };
  let lastError = null;
  for (const base of bases(company.env)) {
    const url = `${base}${path}`;
    try {
      console.log(`IRP ${method} ${url}`);
      const headerBag = headers(company, session.token);
      const result = method === 'GET'
        ? await fetch(url, { headers: headerBag, signal: AbortSignal.timeout(45000) }).then(async (response) => {
          const text = await response.text();
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { error: text.slice(0, 500) }; }
          return { response, json, text };
        })
        : await postJson(url, headerBag, encrypted);
      if (result.response.status >= 500) {
        lastError = new Error(`Portal ${result.response.status} par hai. Doosra IRP try ho raha hai.`);
        continue;
      }
      return unpack(result, session.sek, url);
    } catch (error) {
      if (error.name === 'PortalError') throw error;
      lastError = error;
    }
  }
  throw new Error(`e-Invoice portal tak call nahi pahunchi. ${lastError?.message || ''}`.trim());
}

function unpack(result, sek, url) {
  const json = result.json || {};
  const status = json.Status ?? json.status;
  if (String(status) === '0') {
    const error = new Error(describeError(json));
    error.name = 'PortalError';
    error.portal = json;
    error.url = url;
    throw error;
  }
  if (!result.response.ok) {
    const error = new Error(describeError(json) || `Portal HTTP ${result.response.status}`);
    error.name = 'PortalError';
    error.url = url;
    throw error;
  }
  let data = json.Data ?? json.data ?? null;
  if (typeof data === 'string' && data) {
    try {
      data = JSON.parse(aesDecrypt(data, sek).toString('utf8'));
    } catch {
      data = { raw: data };
    }
  }
  const info = json.InfoDtls || json.info || [];
  return { data, info, url, raw: json };
}

let authFlight = null;

export async function ensureIrpSession(company, { force = false } = {}) {
  if (!company.irp_client_id || !company.irp_client_secret || !company.irp_username || !company.irp_password || !company.irp_public_key) {
    throw new Error('e-Invoice API details Settings mein adhoori hain. Client id, secret, username, password aur public key bharein.');
  }
  if (!force && company.irp_auth_token && company.irp_sek && sessionFresh(company.irp_token_expiry)) {
    return { token: company.irp_auth_token, sek: Buffer.from(company.irp_sek, 'base64') };
  }
  if (!force && authFlight) return authFlight;
  authFlight = login(company, force).finally(() => { authFlight = null; });
  return authFlight;
}

function sessionFresh(expiry) {
  if (!expiry) return false;
  const when = new Date(expiry);
  return Number.isFinite(when.getTime()) && when.getTime() - Date.now() > 60 * 1000;
}

async function login(company, force) {
  const appKey = generateAppKey();
  const body = buildIrpAuthBody({
    username: company.irp_username,
    password: company.irp_password,
    appKey,
    publicKey: company.irp_public_key,
    forceRefresh: force,
  });
  let lastError = null;
  for (const base of bases(company.env)) {
    const url = `${base}/eivital/v1.04/auth`;
    try {
      console.log(`IRP AUTH ${url}`);
      const result = await postJson(url, headers(company), body);
      if (result.response.status >= 500) {
        lastError = new Error(`Auth HTTP ${result.response.status}`);
        continue;
      }
      const json = result.json || {};
      if (String(json.Status ?? json.status) !== '1' || !json.Data?.AuthToken) {
        const error = new Error(describeError(json) || 'e-Invoice login fail.');
        error.name = 'PortalError';
        error.url = url;
        throw error;
      }
      const sek = decryptSek(json.Data.Sek, appKey);
      const expiry = json.Data.TokenExpiry
        ? String(json.Data.TokenExpiry).replace(' ', 'T')
        : new Date(Date.now() + (company.env === 'production' ? 350 : 55) * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE company
        SET irp_auth_token = ?, irp_sek = ?, irp_app_key = ?, irp_token_expiry = ?
        WHERE id = 1
      `).run(json.Data.AuthToken, sek.toString('base64'), appKey.toString('base64'), expiry);
      Object.assign(company, {
        irp_auth_token: json.Data.AuthToken,
        irp_sek: sek.toString('base64'),
        irp_app_key: appKey.toString('base64'),
        irp_token_expiry: expiry,
      });
      return { token: json.Data.AuthToken, sek, url };
    } catch (error) {
      if (error.name === 'PortalError') throw error;
      lastError = error;
    }
  }
  throw new Error(`e-Invoice portal login nahi ho paya. ${lastError?.message || ''}`.trim());
}

export async function generateIrn(nicInvoice) {
  return irpRequest('/eicore/v1.03/Invoice', nicInvoice);
}

export async function generateEwayByIrn(payload) {
  return irpRequest('/eiewb/v1.03/ewaybill', payload);
}

export async function cancelIrn(payload) {
  return irpRequest('/eicore/v1.03/Invoice/Cancel', payload);
}

export async function fetchGstin(gstin) {
  return irpRequest(`/eivital/v1.04/Master/gstin/${encodeURIComponent(gstin)}`, null, { method: 'GET' });
}

export function infoText(info) {
  if (!Array.isArray(info)) return '';
  return info.map((item) => [item.InfCd, item.Desc].filter(Boolean).join(': ')).filter(Boolean).join(' | ');
}
