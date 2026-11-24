import Decimal from 'decimal.js';
import { gstSplit, lineTaxable, roundToRupee } from '../src/money';

describe('decimal money', () => {
  it('prices the soyabeen invoice without floating-point drift', () => {
    const taxable = lineTaxable('313.95', '4507');
    expect(taxable.toFixed(2)).toBe('1414972.65');
    const tax = gstSplit(taxable, '5', true);
    expect(tax.cgst.toFixed(2)).toBe('35374.32');
    expect(tax.sgst.toFixed(2)).toBe('35374.32');
    expect(tax.igst.toFixed(2)).toBe('0.00');
    const exact = taxable.plus(tax.cgst).plus(tax.sgst);
    const invoice = roundToRupee(exact);
    expect(invoice.total.toFixed(0)).toBe('1485721');
    expect(invoice.roundOff.toFixed(2)).toBe('-0.29');
  });

  it('prices the makka bill and keeps interstate tax on IGST', () => {
    const taxable = lineTaxable('246.32', '2560');
    expect(taxable.toFixed(2)).toBe('630579.20');
    const invoice = roundToRupee(taxable);
    expect(invoice.total.toFixed(0)).toBe('630579');
    expect(invoice.roundOff.toFixed(2)).toBe('-0.20');
    const tax = gstSplit(new Decimal('100.00'), '5', false);
    expect(tax.igst.toFixed(2)).toBe('5.00');
    expect(tax.cgst.toFixed(2)).toBe('0.00');
  });
});
