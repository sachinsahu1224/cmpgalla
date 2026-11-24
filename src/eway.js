import { db, getCompany } from './db.js';
import { aesDecrypt, aesEncrypt, buildEwayAuthBody, decryptSek, generateAppKey } from './nic-crypto.js';

const SANDBOX = [
  'https://ewb1api.gstsandbox.nic.in/ewaybillapi/v1.03',
  'https://ewb2api.gstsandbox.nic.in/ewaybillapi/v1.03',
];
const PRODUCTION = [
  'https://ewb1api.gst.gov.in/ewaybillapi/v1.03',
  'https://ewb2api.gst.gov.in/ewaybillapi/v1.03',
];

function bases(env) {
  return env === 'production' ? PRODUCTION : SANDBOX;
}

function headers(company, token) {
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

function describe(payload) {
  if (!payload) return 'e-Way portal se khaali jawab aaya.';
  if (typeof payload === 'string') return payload;
  const code = payload.error?.errorCodes || payload.error?.error_cd || payload.errorCodes;
  if (code) return `e-Way error ${code}`;
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error) return JSON.stringify(payload.error);
  if (payload.message) return payload.message;
  return JSON.stringify(payload);
}

async function call(url, headerBag, body) {
  console.log(`EWAY POST ${url}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: headerBag,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { error: text.slice(0, 500) }; }
  return { response, json };
}

let authFlight = null;

export async function ensureEwaySession(company, { force = false } = {}) {
  if (!company.ewb_client_id || !company.ewb_client_secret || !company.ewb_username || !company.ewb_password || !company.ewb_public_key) {
    throw new Error('e-Way Bill API Settings mein adhoori hai. Yeh alag login ewaybill portal par banta hai.');
  }
  if (!force && company.ewb_auth_token && company.ewb_sek && sessionFresh(company.ewb_token_expiry)) {
    return { token: company.ewb_auth_token, sek: Buffer.from(company.ewb_sek, 'base64') };
  }
  if (!force && authFlight) return authFlight;
  authFlight = login(company).finally(() => { authFlight = null; });
  return authFlight;
}

function sessionFresh(expiry) {
  if (!expiry) return false;
  const when = new Date(expiry);
  return Number.isFinite(when.getTime()) && when.getTime() - Date.now() > 60 * 1000;
}

async function login(company) {
  const appKey = generateAppKey();
  const body = buildEwayAuthBody({
    username: company.ewb_username,
    password: company.ewb_password,
    appKey,
    publicKey: company.ewb_public_key,
  });
  let lastError = null;
  for (const base of bases(company.env)) {
    const url = `${base}/Auth`;
    try {
      const result = await call(url, headers(company), body);
      if (result.response.status >= 500) {
        lastError = new Error(`Auth HTTP ${result.response.status}`);
        continue;
      }
      const json = result.json || {};
      const ok = String(json.status) === '1' && json.authtoken;
      if (!ok) {
        const error = new Error(describe(json));
        error.name = 'PortalError';
        throw error;
      }
      const sek = decryptSek(json.sek, appKey);
      const expiry = new Date(Date.now() + 350 * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE company SET ewb_auth_token = ?, ewb_sek = ?, ewb_app_key = ?, ewb_token_expiry = ? WHERE id = 1
      `).run(json.authtoken, sek.toString('base64'), appKey.toString('base64'), expiry);
      Object.assign(company, {
        ewb_auth_token: json.authtoken,
        ewb_sek: sek.toString('base64'),
        ewb_app_key: appKey.toString('base64'),
        ewb_token_expiry: expiry,
      });
      return { token: json.authtoken, sek, url };
    } catch (error) {
      if (error.name === 'PortalError') throw error;
      lastError = error;
    }
  }
  throw new Error(`e-Way Bill portal login nahi ho paya. ${lastError?.message || ''}`.trim());
}

export async function generateEway(payload) {
  const company = getCompany();
  const session = await ensureEwaySession(company);
  const body = {
    action: 'GENEWAYBILL',
    data: aesEncrypt(JSON.stringify(payload), session.sek),
  };
  let lastError = null;
  for (const base of bases(company.env)) {
    const url = `${base}/ewayapi`;
    try {
      const result = await call(url, headers(company, session.token), body);
      if (result.response.status >= 500) {
        lastError = new Error(`HTTP ${result.response.status}`);
        continue;
      }
      const json = result.json || {};
      if (String(json.status) === '0') {
        const error = new Error(describe(json));
        error.name = 'PortalError';
        throw error;
      }
      let data = json.data;
      if (typeof data === 'string') {
        data = JSON.parse(aesDecrypt(data, session.sek).toString('utf8'));
      }
      if (!result.response.ok && !data?.ewayBillNo) {
        throw new Error(describe(json) || `e-Way HTTP ${result.response.status}`);
      }
      return { data, url };
    } catch (error) {
      if (error.name === 'PortalError') throw error;
      lastError = error;
    }
  }
  throw new Error(`e-Way Bill portal tak call nahi pahunchi. ${lastError?.message || ''}`.trim());
}
