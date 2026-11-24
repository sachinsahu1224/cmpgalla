import Decimal from 'decimal.js';
import { gstSplit, money, roundToRupee } from './money';

export type WeightUnit = 'KG' | 'QTL';
export type ShortageMode = 'NONE' | 'QUANTITY' | 'AMOUNT';
export type BardanaMode = 'NONE' | 'PER_BAG' | 'FLAT';

export const QTL_IN_KG = new Decimal(100);

export type DeductionConfig = {
  shortageMode: ShortageMode;
  bardanaMode: BardanaMode;
  bardanaRate: Decimal.Value;
};

export type RawLine = {
  description: string;
  hsnCode: string;
  bags?: Decimal.Value;
  quantity: Decimal.Value;
  quantityUnit: WeightUnit;
  rate: Decimal.Value;
  rateUnit: WeightUnit;
  discount?: Decimal.Value;
  shortageQty?: Decimal.Value;
  bardanaAmount?: Decimal.Value;
  gstRate: Decimal.Value;
};

export type PricedLine = {
  description: string;
  hsnCode: string;
  bags: Decimal;
  quantity: Decimal;
  quantityUnit: WeightUnit;
  billedQty: Decimal;
  rate: Decimal;
  rateUnit: WeightUnit;
  rateQty: Decimal;
  discount: Decimal;
  shortageQty: Decimal;
  shortageAmount: Decimal;
  bardana: Decimal;
  gross: Decimal;
  taxable: Decimal;
  gstRate: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
  lineTotal: Decimal;
};

export type PricedInvoice = {
  intraState: boolean;
  lines: PricedLine[];
  taxable: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
  roundOff: Decimal;
  total: Decimal;
  words: string;
};

export function toKg(quantity: Decimal.Value, unit: WeightUnit) {
  const qty = new Decimal(quantity);
  if (qty.isNegative()) throw new Error('Quantity cannot be negative');
  return unit === 'QTL' ? qty.mul(QTL_IN_KG) : qty;
}

export function kgTo(kg: Decimal, unit: WeightUnit) {
  return unit === 'QTL' ? kg.div(QTL_IN_KG) : kg;
}

export function financialYear(isoDate: string) {
  const [yearText, monthText] = isoDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function priceInvoice(lines: RawLine[], config: DeductionConfig, intraState: boolean): PricedInvoice {
  if (!lines.length) throw new Error('Add at least one item');
  const priced = lines.map((line) => priceLine(line, config, intraState));
  const taxable = sum(priced.map((line) => line.taxable));
  const cgst = sum(priced.map((line) => line.cgst));
  const sgst = sum(priced.map((line) => line.sgst));
  const igst = sum(priced.map((line) => line.igst));
  const exact = taxable.plus(cgst).plus(sgst).plus(igst);
  const rounded = roundToRupee(exact);
  return {
    intraState,
    lines: priced,
    taxable,
    cgst,
    sgst,
    igst,
    roundOff: rounded.roundOff,
    total: rounded.total,
    words: inWords(rounded.total),
  };
}

function priceLine(line: RawLine, config: DeductionConfig, intraState: boolean): PricedLine {
  const quantity = new Decimal(line.quantity);
  const shortageQty = new Decimal(line.shortageQty ?? 0);
  const rate = new Decimal(line.rate);
  const discount = money(line.discount ?? 0);
  const bags = new Decimal(line.bags ?? 0);
  if (quantity.lte(0)) throw new Error(`${line.description || 'Item'}: quantity must be greater than zero`);
  if (rate.isNegative()) throw new Error(`${line.description || 'Item'}: rate cannot be negative`);
  if (shortageQty.isNegative() || discount.isNegative() || bags.isNegative()) {
    throw new Error(`${line.description || 'Item'}: deductions cannot be negative`);
  }

  const grossKg = toKg(quantity, line.quantityUnit);
  const shortageKg = toKg(shortageQty, line.quantityUnit);
  if (shortageKg.gt(grossKg)) throw new Error(`${line.description || 'Item'}: shortage cannot exceed quantity`);

  const quantityReduced = config.shortageMode === 'QUANTITY';
  const billedKg = quantityReduced ? grossKg.minus(shortageKg) : grossKg;
  if (billedKg.lte(0)) throw new Error(`${line.description || 'Item'}: billed quantity must be greater than zero`);
  const rateQty = kgTo(billedKg, line.rateUnit);
  const gross = money(rateQty.mul(rate));
  const shortageAmount = config.shortageMode === 'AMOUNT' ? money(kgTo(shortageKg, line.rateUnit).mul(rate)) : money(0);
  const bardana = bardanaOnce(config, bags, line.bardanaAmount ?? 0);
  const taxable = money(gross.minus(discount).minus(shortageAmount).minus(bardana));
  if (taxable.isNegative()) throw new Error(`${line.description || 'Item'}: deductions are larger than the amount`);

  const tax = gstSplit(taxable, line.gstRate, intraState);
  const lineTotal = money(taxable.plus(tax.cgst).plus(tax.sgst).plus(tax.igst));
  return {
    description: line.description,
    hsnCode: line.hsnCode,
    bags,
    quantity,
    quantityUnit: line.quantityUnit,
    billedQty: kgTo(billedKg, line.quantityUnit),
    rate,
    rateUnit: line.rateUnit,
    rateQty,
    discount,
    shortageQty: quantityReduced || config.shortageMode === 'AMOUNT' ? shortageQty : new Decimal(0),
    shortageAmount,
    bardana,
    gross,
    taxable,
    gstRate: new Decimal(line.gstRate),
    cgst: tax.cgst,
    sgst: tax.sgst,
    igst: tax.igst,
    lineTotal,
  };
}

function bardanaOnce(config: DeductionConfig, bags: Decimal, flatAmount: Decimal.Value) {
  if (config.bardanaMode === 'PER_BAG') return money(bags.mul(config.bardanaRate));
  if (config.bardanaMode === 'FLAT') return money(flatAmount);
  return money(0);
}

function sum(values: Decimal[]) {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

const BELOW_TWENTY = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

export function inWords(rupees: Decimal) {
  const amount = Number(rupees.toFixed(0));
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Amount cannot be written in words');
  if (amount === 0) return 'Indian Rupees Zero Only';
  const crore = Math.floor(amount / 10000000);
  const lakh = Math.floor((amount % 10000000) / 100000);
  const thousand = Math.floor((amount % 100000) / 1000);
  const rest = amount % 1000;
  const parts = [
    crore ? `${wordsBelowThousand(crore)} Crore` : '',
    lakh ? `${wordsBelowThousand(lakh)} Lakh` : '',
    thousand ? `${wordsBelowThousand(thousand)} Thousand` : '',
    rest ? wordsBelowThousand(rest) : '',
  ].filter(Boolean);
  return `Indian Rupees ${parts.join(' ')} Only`;
}

function wordsBelowThousand(value: number) {
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  const tens = rest < 20 ? BELOW_TWENTY[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${BELOW_TWENTY[rest % 10]}` : ''}`;
  return [hundred ? `${BELOW_TWENTY[hundred]} Hundred` : '', tens].filter(Boolean).join(' ');
}
