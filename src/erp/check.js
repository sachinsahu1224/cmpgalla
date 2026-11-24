import fs from 'node:fs';
import assert from 'node:assert/strict';
import { gstSplit, lineTaxable, money, roundOffToRupee, shortage } from './calc.js';

const taxable = lineTaxable(313.95, 4507, 0);
const tax = gstSplit(taxable, 5, true);
const raw = money(taxable + tax.cgst + tax.sgst);
const roundOff = roundOffToRupee(raw);
assert.equal(taxable, 1414972.65);
assert.equal(tax.cgst, 35374.32);
assert.equal(tax.sgst, 35374.32);
assert.equal(roundOff, -0.29);
assert.equal(money(raw + roundOff), 1485721);
const short = shortage(246.32, 244.82, 2560);
assert.equal(short.shortageQtl, 1.5);
assert.equal(short.amount, 3840);

process.env.GALLA_DB = new URL('../../data/erp-check.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.rmSync(process.env.GALLA_DB, { force: true });
const { savePurchase, postPurchase, saveSale, postSale, createDispatch, receiveGoods, decideAdjustment, listOwned, own, seedDemo } = await import('./books.js');
const { db } = await import('./db.js');
const { preview } = await import('./gst.js');

seedDemo();
const user = { companyId: 1, username: 'admin' };
const purchase = savePurchase(user, {
  supplierId: 1, warehouseId: 1, docDate: '2026-11-18', advance: 0,
  lines: [{ productId: 1, bags: 10, grossQtl: 50, tareQtl: 0, netQtl: 50, rate: 4000, gstRate: 5 }],
  expenses: [{ categoryId: 5, description: 'Hamali', amount: 1000, settlement: 'CASH' }],
});
assert.equal(purchase.totalCost, 211000);
postPurchase(user, purchase.id);
const sale = saveSale(user, {
  customerId: 1, warehouseId: 1, docDate: '2026-11-18', vehicleNo: 'MP09HG1145', advance: 0,
  lines: [{ productId: 1, bags: 4, quantityQtl: 20, rate: 4500, discount: 0, gstRate: 5, hsnCode: '12019000' }],
});
const invoiceTotal = sale.total;
postSale(user, sale.id);
const dispatch = createDispatch(user, {
  salesId: sale.id, dispatchDate: '2026-11-18', destination: 'Ganjbasoda',
  items: [{ productId: 1, bags: 4, weightQtl: 20, vehicleNo: 'MP09HG1145', freight: 500, loading: 0, unloading: 0 }],
});
const item = db.prepare('SELECT id FROM dispatch_items WHERE dispatch_id = ?').get(dispatch.id);
receiveGoods(user, { dispatchItemId: item.id, receivedDate: '2026-11-18', receivedQtl: 19.5, rate: 4500, createClaim: true });
const claim = listOwned('weight_adjustments', 1)[0];
assert.equal(claim.status, 'PENDING');
assert.equal(claim.claimAmount, 2250);
decideAdjustment(user, claim.id, 'APPROVED', 2250, 'Customer claim accepted');
assert.equal(own('sales', sale.id, 1).total, invoiceTotal);
const look = preview(user, sale.id);
assert.equal(look.irnInvented, false);
assert.equal(look.mode, 'DEMO');
console.log('ERP check ok');
