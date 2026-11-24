import crypto from 'node:crypto';
import { inWords, round2 } from './money.js';
import { aesDecrypt, aesEncrypt, buildIrpAuthBody, decryptSek, generateAppKey, rsaEncrypt } from './nic-crypto.js';
import { priceBill } from './payload.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const priced = priceBill({
  lines: [{ description: 'Soyabeen', hsn: '12019000', qty: 313.95, unit: 'QTL', rate: 4507, gst_rate: 5, bags: 0 }],
  cashDiscount: 0,
  otherCharges: 0,
  sellerState: '23',
  buyerState: '23',
});

assert(priced.taxable === 1414972.65, `taxable ${priced.taxable}`);
assert(priced.cgst === 35374.32, `cgst ${priced.cgst}`);
assert(priced.sgst === 35374.32, `sgst ${priced.sgst}`);
assert(priced.total === 1485721, `total ${priced.total}`);
assert(priced.round_off === -0.29, `round ${priced.round_off}`);
assert(priced.words === 'Indian Rupees Fourteen Lakh Eighty Five Thousand Seven Hundred Twenty One Only', priced.words);

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const appKey = generateAppKey();
const auth = buildIrpAuthBody({ username: 'user', password: 'secret', appKey, publicKey: pem, forceRefresh: false });
const decoded = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(auth.Data, 'base64'));
const plain = JSON.parse(Buffer.from(decoded.toString('utf8'), 'base64').toString('utf8'));
assert(plain.username === 'user' && plain.appkey === appKey.toString('base64'), 'auth payload mismatch');

const sek = generateAppKey();
const wrapped = aesEncrypt(sek.toString('base64'), appKey);
const opened = decryptSek(wrapped, appKey);
assert(opened.equals(sek), 'sek decrypt failed');

const invoice = aesEncrypt(JSON.stringify({ Irn: 'abc' }), sek);
assert(JSON.parse(aesDecrypt(invoice, sek).toString('utf8')).Irn === 'abc', 'invoice decrypt failed');
assert(rsaEncrypt('hello', pem).length > 20, 'rsa');
assert(round2(1.005) === 1.01 || round2(1.005) === 1, 'round sanity');
assert(inWords(630579).includes('Six Lakh Thirty Thousand Five Hundred Seventy Nine'), inWords(630579));

console.log('selfcheck ok');
console.log(priced);
