import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function money(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(2);
}

export function lineTaxable(quantity: Decimal.Value, rate: Decimal.Value, discount: Decimal.Value = 0) {
  return money(new Decimal(quantity).mul(rate).minus(discount));
}

export function gstSplit(taxable: Decimal, gstRate: Decimal.Value, intraState: boolean) {
  const rate = new Decimal(gstRate);
  if (intraState) {
    const half = taxable.mul(rate).div(200);
    return { cgst: money(half), sgst: money(half), igst: money(0) };
  }
  return { cgst: money(0), sgst: money(0), igst: money(taxable.mul(rate).div(100)) };
}

export function roundToRupee(exact: Decimal) {
  const total = exact.toDecimalPlaces(0);
  return { total, roundOff: money(total.minus(exact)) };
}
