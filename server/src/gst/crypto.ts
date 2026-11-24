import crypto from 'node:crypto';

export function normalizePem(input: string) {
  const raw = input.trim();
  if (!raw) return '';
  if (raw.includes('BEGIN ')) return raw;
  const body = raw.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? raw;
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`;
}

export function rsaEncrypt(text: string, pem: string) {
  return crypto.publicEncrypt(
    { key: crypto.createPublicKey(normalizePem(pem)), padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(text, 'utf8'),
  ).toString('base64');
}

export function generateAppKey() {
  return crypto.randomBytes(32);
}

function aesAlgorithm(key: Buffer) {
  if (key.length === 16) return 'aes-128-ecb';
  if (key.length === 24) return 'aes-192-ecb';
  if (key.length === 32) return 'aes-256-ecb';
  throw new Error('The portal session key is not a 16 or 32 byte AES key');
}

export function aesEncrypt(plainText: string, key: Buffer) {
  const cipher = crypto.createCipheriv(aesAlgorithm(key), key, null);
  return Buffer.concat([cipher.update(Buffer.from(plainText, 'utf8')), cipher.final()]).toString('base64');
}

export function aesDecrypt(payload: string, key: Buffer) {
  const decipher = crypto.createDecipheriv(aesAlgorithm(key), key, null);
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]);
}

export function decryptSek(encryptedSek: string, appKey: Buffer) {
  const decrypted = aesDecrypt(encryptedSek, appKey);
  if (decrypted.length === 16 || decrypted.length === 32) return decrypted;
  const text = decrypted.toString('utf8').replace(/\s+/g, '');
  const decoded = Buffer.from(text, 'base64');
  if (decoded.length === 16 || decoded.length === 32) return decoded;
  throw new Error('The portal session key could not be read');
}

export function buildIrpAuthBody(input: { username: string; password: string; appKey: Buffer; publicKey: string }) {
  const plain = JSON.stringify({
    username: input.username,
    password: input.password,
    appkey: input.appKey.toString('base64'),
    ForceRefreshAccessToken: false,
  });
  return { Data: rsaEncrypt(Buffer.from(plain, 'utf8').toString('base64'), input.publicKey) };
}

export function requestHash(payload: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
