const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

export function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(n) + 1e-8) * 100) / 100;
}

export function round3(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(n) + 1e-8) * 1000) / 1000;
}

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return TENS[ten] + (one ? ` ${ONES[one]}` : '');
}

function threeDigits(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundred ? `${ONES[hundred]} Hundred` : '';
  if (!rest) return head;
  return head ? `${head} ${twoDigits(rest)}` : twoDigits(rest);
}

export function inWords(amount) {
  const rupees = Math.round(round2(amount));
  if (!rupees) return 'Indian Rupees Zero Only';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  const parts = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return `Indian Rupees ${parts.join(' ')} Only`;
}

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function toNicDate(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function financialYear(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${start + 1}`;
}
