import { inWords, round2, round3 } from '../money.js';

export function money(value) {
  return round2(value);
}

export function qty(value) {
  return round3(value);
}

export function kgToQtl(kg) {
  return qty(Number(kg || 0) / 100);
}

export function gstSplit(taxable, rate, intra) {
  const gst = Number(rate) || 0;
  if (!intra) return { cgst: 0, sgst: 0, igst: money((Number(taxable) * gst) / 100) };
  const half = money((Number(taxable) * gst) / 200);
  return { cgst: half, sgst: half, igst: 0 };
}

export function lineTaxable(netQtl, rate, discount = 0) {
  return money(Number(netQtl) * Number(rate) - Number(discount || 0));
}

export function roundOffToRupee(raw) {
  const base = money(raw);
  return money(Math.round(base) - base);
}

export function shortage(dispatchQtl, receivedQtl, rate) {
  const difference = qty(Number(dispatchQtl) - Number(receivedQtl));
  const percent = Number(dispatchQtl) ? money((difference / Number(dispatchQtl)) * 100) : 0;
  return { shortageQtl: difference, percent, amount: money(difference * Number(rate || 0)), excess: difference < 0 };
}

export { inWords };
