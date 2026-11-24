import { aesDecrypt, aesEncrypt, buildIrpAuthBody, decryptSek, generateAppKey, rsaEncrypt } from './crypto';

export type PortalCredentials = {
  gstin: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  publicKey: string;
};

export type PortalOutcome = {
  status: 'GENERATED' | 'FAILED' | 'NOT_SENT' | 'CANCELLED';
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  signedQr: string | null;
  signedInvoice: string | null;
  ewayNo: string | null;
  generatedAt: string | null;
  validUpto: string | null;
  message: string;
  response: unknown;
};

type FetchLike = typeof fetch;

const IRP_SANDBOX = ['https://einv1api.gstsandbox.nic.in', 'https://einv2api.gstsandbox.nic.in'];
const IRP_PRODUCTION = ['https://einvoice1.gst.gov.in', 'https://einvoice2.gst.gov.in'];
const EWAY_SANDBOX = ['https://ewb1api.gstsandbox.nic.in/ewaybillapi/v1.03', 'https://ewb2api.gstsandbox.nic.in/ewaybillapi/v1.03'];
const EWAY_PRODUCTION = ['https://ewb1api.gst.gov.in/ewaybillapi/v1.03', 'https://ewb2api.gst.gov.in/ewaybillapi/v1.03'];
const IRN_RE = /^[0-9a-fA-F]{64}$/;

export function credentialsReady(credentials: Partial<PortalCredentials> | null | undefined): credentials is PortalCredentials {
  return Boolean(credentials?.clientId && credentials.clientSecret && credentials.username && credentials.password && credentials.publicKey && credentials.gstin);
}

export function productionEnabled() {
  return process.env.GST_PRODUCTION_ENABLED === 'true';
}

export function hosts(kind: 'irp' | 'eway', mode: 'SANDBOX' | 'PRODUCTION') {
  if (kind === 'irp') return mode === 'PRODUCTION' ? IRP_PRODUCTION : IRP_SANDBOX;
  return mode === 'PRODUCTION' ? EWAY_PRODUCTION : EWAY_SANDBOX;
}

export async function submitToPortal(input: {
  kind: 'irp' | 'eway';
  mode: 'SANDBOX' | 'PRODUCTION';
  path: string;
  action?: string;
  credentials: PortalCredentials;
  payload: unknown;
  fetchImpl?: FetchLike;
}): Promise<PortalOutcome> {
  if (input.mode === 'PRODUCTION' && !productionEnabled()) {
    return emptyOutcome('FAILED', 'Production GST calls are disabled. No request was sent.');
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const appKey = generateAppKey();
  let session: { token: string; sek: Buffer; base: string } | null = null;
  let lastError = 'The portal did not accept the login';
  for (const base of hosts(input.kind, input.mode)) {
    try {
      session = await login(input.kind, base, input.credentials, appKey, fetchImpl);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  if (!session) return emptyOutcome('FAILED', `${lastError} No IRN or e-way number was stored.`);
  const url = `${session.base}${input.path}`;
  const encrypted = aesEncrypt(JSON.stringify(input.payload), session.sek);
  const body = input.kind === 'eway'
    ? { action: input.action ?? 'GENEWAYBILL', data: encrypted }
    : { Data: encrypted };
  const response = await postJson(fetchImpl, url, headers(input.credentials, session.token), body);
  return readOutcome(response.json, session.sek);
}

export async function cancelOnPortal(input: Parameters<typeof submitToPortal>[0]) {
  return submitToPortal(input);
}

async function login(kind: 'irp' | 'eway', base: string, credentials: PortalCredentials, appKey: Buffer, fetchImpl: FetchLike) {
  if (kind === 'eway') {
    const url = `${base}/Auth`;
    const body = {
      action: 'ACCESSTOKEN',
      username: credentials.username,
      password: aesEncrypt(credentials.password, appKey),
      app_key: encryptKey(appKey, credentials.publicKey),
    };
    const result = await postJson(fetchImpl, url, headers(credentials), body);
    const data = result.json?.['Data'] as { AuthToken?: string; Sek?: string } | undefined;
    if (String(result.json?.['Status'] ?? result.json?.['status']) !== '1' || !data?.AuthToken || !data.Sek) {
      throw new Error(describe(result.json) || 'e-Way login failed');
    }
    return { token: data.AuthToken, sek: decryptSek(data.Sek, appKey), base };
  }
  const url = `${base}/eivital/v1.04/auth`;
  const result = await postJson(fetchImpl, url, headers(credentials), buildIrpAuthBody({
    username: credentials.username,
    password: credentials.password,
    appKey,
    publicKey: credentials.publicKey,
  }));
  const data = result.json?.['Data'] as { AuthToken?: string; Sek?: string } | undefined;
  if (String(result.json?.['Status'] ?? result.json?.['status']) !== '1' || !data?.AuthToken || !data.Sek) {
    throw new Error(describe(result.json) || 'e-Invoice login failed');
  }
  return { token: data.AuthToken, sek: decryptSek(data.Sek, appKey), base };
}

function encryptKey(appKey: Buffer, publicKey: string) {
  return rsaEncrypt(appKey.toString('base64'), publicKey);
}

function headers(credentials: PortalCredentials, token?: string) {
  const value: Record<string, string> = {
    'Content-Type': 'application/json',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    'client-id': credentials.clientId,
    'client-secret': credentials.clientSecret,
    gstin: credentials.gstin,
    Gstin: credentials.gstin,
  };
  if (token) {
    value.AuthToken = token;
    value.user_name = credentials.username;
  }
  return value;
}

async function postJson(fetchImpl: FetchLike, url: string, headerBag: Record<string, string>, body: unknown) {
  const response = await fetchImpl(url, { method: 'POST', headers: headerBag, body: JSON.stringify(body) });
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? JSON.parse(text) as Record<string, unknown> : null;
  } catch {
    json = { error: text.slice(0, 500) };
  }
  return { response, json };
}

function readOutcome(json: Record<string, unknown> | null, sek: Buffer): PortalOutcome {
  if (!json || String(json['Status'] ?? json['status']) === '0') {
    return emptyOutcome('FAILED', describe(json) || 'The portal rejected the request. No number was stored.', json);
  }
  let data: Record<string, unknown> = {};
  const raw = json['Data'] ?? json['data'];
  if (typeof raw === 'string' && raw) {
    try {
      data = JSON.parse(aesDecrypt(raw, sek).toString('utf8')) as Record<string, unknown>;
    } catch {
      return emptyOutcome('FAILED', 'The portal response could not be read. No number was stored.', json);
    }
  } else if (raw && typeof raw === 'object') {
    data = raw as Record<string, unknown>;
  }
  const irn = typeof data['Irn'] === 'string' && IRN_RE.test(data['Irn']) ? data['Irn'] : null;
  const ewayNo = firstText(data, ['EwbNo', 'ewayBillNo']);
  return {
    status: irn || ewayNo ? 'GENERATED' : 'FAILED',
    irn,
    ackNo: firstText(data, ['AckNo']),
    ackDate: firstText(data, ['AckDt']),
    signedQr: irn ? firstText(data, ['SignedQRCode']) : null,
    signedInvoice: irn ? firstText(data, ['SignedInvoice']) : null,
    ewayNo,
    generatedAt: firstText(data, ['EwbDt', 'ewayBillDate']),
    validUpto: firstText(data, ['EwbValidTill', 'validUpto']),
    message: irn || ewayNo ? 'Received from the GST portal' : (describe(json) || 'The portal response had no IRN or e-way number'),
    response: data,
  };
}

function emptyOutcome(status: PortalOutcome['status'], message: string, response: unknown = null): PortalOutcome {
  return {
    status,
    irn: null,
    ackNo: null,
    ackDate: null,
    signedQr: null,
    signedInvoice: null,
    ewayNo: null,
    generatedAt: null,
    validUpto: null,
    message,
    response,
  };
}

function firstText(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function describe(payload: Record<string, unknown> | null) {
  if (!payload) return '';
  const parts: string[] = [];
  for (const key of ['error', 'Error', 'message', 'status_desc']) {
    if (typeof payload[key] === 'string') parts.push(payload[key] as string);
  }
  const details = payload['ErrorDetails'] ?? payload['errorDetails'];
  if (Array.isArray(details)) {
    for (const item of details) {
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        parts.push([row['ErrorCode'], row['ErrorMessage']].filter(Boolean).join(': '));
      }
    }
  }
  return parts.filter(Boolean).join(' | ');
}
