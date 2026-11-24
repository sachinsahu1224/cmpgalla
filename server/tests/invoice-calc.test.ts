import { priceInvoice } from '../src/invoice-calc';

const noDeductions = { shortageMode: 'NONE' as const, bardanaMode: 'NONE' as const, bardanaRate: '0' };

describe('sales invoice calculation', () => {
  it('prices soyabeen with intra-state GST and rupee rounding', () => {
    const priced = priceInvoice([
      {
        description: 'Soyabeen',
        hsnCode: '12019000',
        quantity: '313.95',
        quantityUnit: 'QTL',
        rate: '4507',
        rateUnit: 'QTL',
        gstRate: '5',
      },
    ], noDeductions, true);
    expect(priced.taxable.toFixed(2)).toBe('1414972.65');
    expect(priced.cgst.toFixed(2)).toBe('35374.32');
    expect(priced.sgst.toFixed(2)).toBe('35374.32');
    expect(priced.igst.toFixed(2)).toBe('0.00');
    expect(priced.roundOff.toFixed(2)).toBe('-0.29');
    expect(priced.total.toFixed(0)).toBe('1485721');
    expect(priced.words).toBe('Indian Rupees Fourteen Lakh Eighty Five Thousand Seven Hundred Twenty One Only');
  });

  it('prices makka as exempt and rounds to the rupee', () => {
    const priced = priceInvoice([
      {
        description: 'Makka',
        hsnCode: '10059000',
        bags: '440',
        quantity: '246.32',
        quantityUnit: 'QTL',
        rate: '2560',
        rateUnit: 'QTL',
        gstRate: '0',
      },
    ], noDeductions, true);
    expect(priced.taxable.toFixed(2)).toBe('630579.20');
    expect(priced.total.toFixed(0)).toBe('630579');
    expect(priced.roundOff.toFixed(2)).toBe('-0.20');
    expect(priced.words).toBe('Indian Rupees Six Lakh Thirty Thousand Five Hundred Seventy Nine Only');
  });

  it('treats one quintal as one hundred kilograms for both quantity and rate', () => {
    const byQuintal = priceInvoice([
      { description: 'Makka', hsnCode: '10059000', quantity: '1', quantityUnit: 'QTL', rate: '2560', rateUnit: 'QTL', gstRate: '0' },
    ], noDeductions, true);
    const byKg = priceInvoice([
      { description: 'Makka', hsnCode: '10059000', quantity: '100', quantityUnit: 'KG', rate: '25.60', rateUnit: 'KG', gstRate: '0' },
    ], noDeductions, true);
    const mixed = priceInvoice([
      { description: 'Makka', hsnCode: '10059000', quantity: '100', quantityUnit: 'KG', rate: '2560', rateUnit: 'QTL', gstRate: '0' },
    ], noDeductions, true);
    expect(byQuintal.taxable.toFixed(2)).toBe('2560.00');
    expect(byKg.taxable.toFixed(2)).toBe(byQuintal.taxable.toFixed(2));
    expect(mixed.taxable.toFixed(2)).toBe(byQuintal.taxable.toFixed(2));
  });

  it('charges IGST only when the supply is inter-state', () => {
    const priced = priceInvoice([
      { description: 'Soyabeen', hsnCode: '12019000', quantity: '100', quantityUnit: 'KG', rate: '1', rateUnit: 'KG', gstRate: '5' },
    ], noDeductions, false);
    expect(priced.igst.toFixed(2)).toBe('5.00');
    expect(priced.cgst.toFixed(2)).toBe('0.00');
    expect(priced.sgst.toFixed(2)).toBe('0.00');
  });

  it('applies a quantity shortage once and does not deduct that weight again as money', () => {
    const priced = priceInvoice([
      {
        description: 'Wheat',
        hsnCode: '10019910',
        quantity: '100',
        quantityUnit: 'QTL',
        rate: '1000',
        rateUnit: 'QTL',
        shortageQty: '1',
        gstRate: '0',
      },
    ], { shortageMode: 'QUANTITY', bardanaMode: 'NONE', bardanaRate: '0' }, true);
    expect(priced.lines[0].billedQty.toFixed(3)).toBe('99.000');
    expect(priced.lines[0].shortageAmount.toFixed(2)).toBe('0.00');
    expect(priced.taxable.toFixed(2)).toBe('99000.00');
  });

  it('applies an amount shortage once without also reducing the billed quantity', () => {
    const priced = priceInvoice([
      {
        description: 'Wheat',
        hsnCode: '10019910',
        quantity: '100',
        quantityUnit: 'QTL',
        rate: '1000',
        rateUnit: 'QTL',
        shortageQty: '1',
        gstRate: '0',
      },
    ], { shortageMode: 'AMOUNT', bardanaMode: 'NONE', bardanaRate: '0' }, true);
    expect(priced.lines[0].billedQty.toFixed(3)).toBe('100.000');
    expect(priced.lines[0].shortageAmount.toFixed(2)).toBe('1000.00');
    expect(priced.taxable.toFixed(2)).toBe('99000.00');
  });

  it('applies bardana either per bag or as a flat amount, not both', () => {
    const line = {
      description: 'Makka',
      hsnCode: '10059000',
      bags: '10',
      quantity: '10',
      quantityUnit: 'QTL' as const,
      rate: '1000',
      rateUnit: 'QTL' as const,
      bardanaAmount: '100',
      gstRate: '0',
    };
    const perBag = priceInvoice([line], { shortageMode: 'NONE', bardanaMode: 'PER_BAG', bardanaRate: '2' }, true);
    const flat = priceInvoice([line], { shortageMode: 'NONE', bardanaMode: 'FLAT', bardanaRate: '2' }, true);
    expect(perBag.lines[0].bardana.toFixed(2)).toBe('20.00');
    expect(perBag.taxable.toFixed(2)).toBe('9980.00');
    expect(flat.lines[0].bardana.toFixed(2)).toBe('100.00');
    expect(flat.taxable.toFixed(2)).toBe('9900.00');
  });
});
