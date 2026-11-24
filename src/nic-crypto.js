import crypto from 'node:crypto';

export function normalizePem(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (raw.includes('BEGIN ')) return raw;
  const body = raw.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || raw;
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`;
}

export function publicKeyFromPem(pem) {
  return crypto.createPublicKey(normalizePem(pem));
}

export function rsaEncrypt(text, pem) {
  const encrypted = crypto.publicEncrypt(
    { key: publicKeyFromPem(pem), padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(text, 'utf8'),
  );
  return encrypted.toString('base64');
}

export function generateAppKey() {
  return crypto.randomBytes(32);
}

function aesAlgorithm(key) {
  if (key.length === 16) return 'aes-128-ecb';
  if (key.length === 24) return 'aes-192-ecb';
  if (key.length === 32) return 'aes-256-ecb';
  throw new Error(`AES key ${key.length} bytes ki hai. 16 ya 32 bytes chahiye.`);
}

export function aesEncrypt(plainText, key) {
  const cipher = crypto.createCipheriv(aesAlgorithm(key), key, null);
  return Buffer.concat([cipher.update(Buffer.from(plainText, 'utf8')), cipher.final()]).toString('base64');
}

export function aesDecrypt(payload, key) {
  const decipher = crypto.createDecipheriv(aesAlgorithm(key), key, null);
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]);
}

export function normalizeSessionKey(decrypted) {
  if (decrypted.length === 16 || decrypted.length === 32) return decrypted;
  const text = decrypted.toString('utf8').replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(text)) {
    const decoded = Buffer.from(text, 'base64');
    if (decoded.length === 16 || decoded.length === 32) return decoded;
  }
  throw new Error('Portal ka session key decrypt to ho gaya, lekin AES key ke size mein nahi hai.');
}

export function decryptSek(encryptedSek, appKey) {
  return normalizeSessionKey(aesDecrypt(encryptedSek, appKey));
}

export function buildIrpAuthBody({ username, password, appKey, publicKey, forceRefresh = false }) {
  const plain = JSON.stringify({
    username,
    password,
    appkey: appKey.toString('base64'),
    ForceRefreshAccessToken: forceRefresh,
  });
  const encoded = Buffer.from(plain, 'utf8').toString('base64');
  if (Buffer.byteLength(encoded) > 245) {
    throw new Error('API password bahut lamba hai. Portal wali public key 245 characters se bada data encrypt nahi karti.');
  }
  return { Data: rsaEncrypt(encoded, publicKey) };
}

export function buildEwayAuthBody({ username, password, appKey, publicKey }) {
  return {
    action: 'ACCESSTOKEN',
    username,
    password: aesEncrypt(password, appKey),
    app_key: rsaEncrypt(appKey.toString('base64'), publicKey),
  };
}
