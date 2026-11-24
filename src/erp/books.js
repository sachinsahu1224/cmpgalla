import { financialYear, todayISO } from '../money.js';
import { gstSplit, inWords, kgToQtl, lineTaxable, money, qty, roundOffToRupee, shortage } from './calc.js';
import { camel, db, fail, hashPassword, rows, tx } from './db.js';

function companyOf(id) {
  return db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
}

function sameState(company, party) {
  const seller = company.state_code;
  const buyer = party?.state_code || (party?.gstin ? String(party.gstin).slice(0, 2) : seller);
  return seller === buyer;
}

export function nextNumber(companyId, name, date) {
  const fy = financialYear(date || todayISO());
  db.prepare('INSERT INTO number_sequences (company_id, name, fy, last_value) VALUES (?, ?, ?, 0) ON CONFLICT(company_id, name, fy) DO NOTHING').run(companyId, name, fy);
  const row = db.prepare('UPDATE number_sequences SET last_value = last_value + 1 WHERE company_id = ? AND name = ? AND fy = ? RETURNING last_value').get(companyId, name, fy);
  return `${name}/${fy}/${String(row.last_value).padStart(4, '0')}`;
}

function account(companyId, code) {
  const row = db.prepare('SELECT * FROM accounts WHERE company_id = ? AND code = ?').get(companyId, code);
  if (!row) fail(500, `Account ${code} missing`);
  return row;
}

function audit(companyId, username, action, refType, refId, note) {
  db.prepare('INSERT INTO audit_logs (company_id, username, action, ref_type, ref_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(companyId, username, action, refType, refId, note || '', new Date().toISOString());
}

function postJournal(companyId, date, seq, refType, refId, narration, lines) {
  const debit = money(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const credit = money(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  if (money(debit - credit) !== 0) fail(500, `Journal unbalanced ${debit} vs ${credit}`);
  const voucher = nextNumber(companyId, seq, date);
  const entry = db.prepare('INSERT INTO journal_entries (company_id, entry_date, voucher_no, ref_type, ref_id, narration) VALUES (?, ?, ?, ?, ?, ?) RETURNING id').get(companyId, date, voucher, refType, refId, narration);
  const insert = db.prepare('INSERT INTO journal_lines (entry_id, account_id, party_type, party_id, debit, credit, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const line of lines) {
    if (!line.debit && !line.credit) continue;
    const ledger = account(companyId, line.code);
    insert.run(entry.id, ledger.id, line.partyType || null, line.partyId || null, money(line.debit), money(line.credit), line.note || '');
  }
  return voucher;
}

function reverseJournals(companyId, refType, refId, date) {
  const entries = db.prepare('SELECT * FROM journal_entries WHERE company_id = ? AND ref_type = ? AND ref_id = ? AND reversed = 0').all(companyId, refType, refId);
  for (const entry of entries) {
    const lines = db.prepare('SELECT l.*, a.code FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = ?').all(entry.id);
    postJournal(companyId, date, 'REV', refType, refId, `Reversal ${entry.voucher_no}`, lines.map((line) => ({
      code: line.code, partyType: line.party_type, partyId: line.party_id, debit: line.credit, credit: line.debit, note: 'Reversal',
    })));
    db.prepare('UPDATE journal_entries SET reversed = 1 WHERE id = ?').run(entry.id);
  }
}

function receiveStock(companyId, productId, warehouseId, purchaseItemId, kg, value, refType, refId) {
  db.prepare('INSERT INTO stock_ledger (company_id, product_id, warehouse_id, purchase_item_id, qty_kg, value_amount, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(companyId, productId, warehouseId, purchaseItemId, qty(kg), money(value), refType, refId);
}

function issueStock(company, productId, warehouseId, kg, refType, refId) {
  let left = qty(kg);
  let cost = 0;
  const lots = db.prepare(`
    SELECT purchase_item_id, SUM(qty_kg) AS qty, SUM(value_amount) AS val
    FROM stock_ledger
    WHERE company_id = ? AND product_id = ? AND warehouse_id = ?
    GROUP BY purchase_item_id
    HAVING SUM(qty_kg) > 0.001
    ORDER BY MIN(id)
  `).all(company.id, productId, warehouseId);
  for (const lot of lots) {
    if (left <= 0.001) break;
    const take = Math.min(left, Number(lot.qty));
    const rate = Number(lot.qty) ? Number(lot.val) / Number(lot.qty) : 0;
    const value = money(take * rate);
    receiveStock(company.id, productId, warehouseId, lot.purchase_item_id, -take, -value, refType, refId);
    cost = money(cost + value);
    left = qty(left - take);
  }
  if (left > 0.001) {
    if (!company.allow_negative_stock) fail(409, `Stock kam hai. ${kgToQtl(left)} quintal aur chahiye.`);
    receiveStock(company.id, productId, warehouseId, null, -left, 0, refType, refId);
  }
  return cost;
}

function reverseStock(companyId, refType, refId) {
  const moves = db.prepare('SELECT * FROM stock_ledger WHERE company_id = ? AND ref_type = ? AND ref_id = ?').all(companyId, refType, refId);
  for (const move of moves) {
    receiveStock(companyId, move.product_id, move.warehouse_id, move.purchase_item_id, -move.qty_kg, -move.value_amount, `${refType}_CANCEL`, refId);
  }
}

function netQtl(line) {
  return Number(line.grossQtl) > 0 ? qty(Number(line.grossQtl) - Number(line.tareQtl || 0)) : qty(line.netQtl);
}

export function savePurchase(user, body) {
  return tx(() => {
    const company = companyOf(user.companyId);
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ? AND company_id = ?').get(body.supplierId, user.companyId);
    if (!supplier) fail(400, 'Supplier choose karein.');
    const date = body.docDate || todayISO();
    const docNo = body.docNo ? String(body.docNo).trim() : nextNumber(user.companyId, 'PUR', date);
    const purchase = db.prepare(`INSERT INTO purchases (company_id, supplier_id, warehouse_id, broker_id, doc_no, doc_date, status, advance, remarks)
      VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?) RETURNING *`).get(user.companyId, supplier.id, body.warehouseId, body.brokerId || null, docNo, date, money(body.advance), body.remarks || '');
    pricePurchase(company, supplier, purchase, body.lines || [], body.expenses || []);
    audit(user.companyId, user.username, 'CREATE', 'PURCHASE', purchase.id, docNo);
    return camel(db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchase.id));
  });
}

function pricePurchase(company, supplier, purchase, lines, expenses) {
  const intra = sameState(company, supplier);
  db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(purchase.id);
  db.prepare('DELETE FROM purchase_expenses WHERE purchase_id = ?').run(purchase.id);
  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const saved = [];
  for (const line of lines) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(line.productId);
    const net = netQtl(line);
    const gstRate = line.gstRate == null ? Number(product?.gst_rate || 0) : Number(line.gstRate);
    const base = lineTaxable(net, line.rate, 0);
    const tax = gstSplit(base, gstRate, intra);
    const item = db.prepare(`INSERT INTO purchase_items (purchase_id, product_id, bags, gross_qtl, tare_qtl, net_qtl, rate, gst_rate, taxable, cgst, sgst, igst)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).get(purchase.id, line.productId, qty(line.bags), qty(line.grossQtl), qty(line.tareQtl), net, money(line.rate), gstRate, base, tax.cgst, tax.sgst, tax.igst);
    saved.push(item);
    taxable = money(taxable + base);
    cgst = money(cgst + tax.cgst);
    sgst = money(sgst + tax.sgst);
    igst = money(igst + tax.igst);
  }
  let expenseTotal = 0;
  for (const expense of expenses) {
    const amount = money(expense.amount);
    if (!amount) continue;
    db.prepare('INSERT INTO purchase_expenses (purchase_id, category_id, description, amount, settlement) VALUES (?, ?, ?, ?, ?)').run(purchase.id, expense.categoryId, expense.description || '', amount, expense.settlement || 'CASH');
    expenseTotal = money(expenseTotal + amount);
  }
  let allocated = 0;
  saved.forEach((item, index) => {
    const share = index === saved.length - 1 ? money(expenseTotal - allocated) : (taxable ? money(expenseTotal * (item.taxable / taxable)) : 0);
    allocated = money(allocated + share);
    const cost = item.net_qtl ? money((item.taxable + share) / item.net_qtl * 10000) / 10000 : 0;
    db.prepare('UPDATE purchase_items SET expense_share = ?, cost_per_qtl = ? WHERE id = ?').run(share, Number(cost.toFixed(4)), item.id);
  });
  const supplierAmount = money(taxable + cgst + sgst + igst);
  db.prepare('UPDATE purchases SET taxable=?, cgst=?, sgst=?, igst=?, expense_total=?, supplier_amount=?, total_cost=? WHERE id=?')
    .run(taxable, cgst, sgst, igst, expenseTotal, supplierAmount, money(supplierAmount + expenseTotal), purchase.id);
}

export function postPurchase(user, id) {
  return tx(() => {
    const purchase = own('purchases', id, user.companyId);
    if (purchase.status !== 'DRAFT') fail(409, 'Sirf draft purchase post hoti hai.');
    const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(id);
    const expenses = db.prepare('SELECT * FROM purchase_expenses WHERE purchase_id = ?').all(id);
    const lines = [{ code: '1200', debit: money(purchase.taxable + purchase.expense_total), credit: 0, note: 'Purchase stock' }];
    if (purchase.cgst) lines.push({ code: '1300', debit: purchase.cgst, credit: 0, note: 'Input CGST' });
    if (purchase.sgst) lines.push({ code: '1310', debit: purchase.sgst, credit: 0, note: 'Input SGST' });
    if (purchase.igst) lines.push({ code: '1320', debit: purchase.igst, credit: 0, note: 'Input IGST' });
    let cash = 0;
    let bank = 0;
    let supplierExtra = 0;
    for (const expense of expenses) {
      if (expense.settlement === 'BANK') bank = money(bank + expense.amount);
      else if (expense.settlement === 'SUPPLIER') supplierExtra = money(supplierExtra + expense.amount);
      else cash = money(cash + expense.amount);
    }
    lines.push({ code: '2000', partyType: 'SUPPLIER', partyId: purchase.supplier_id, debit: 0, credit: money(purchase.supplier_amount + supplierExtra), note: 'Supplier' });
    if (cash) lines.push({ code: '1000', debit: 0, credit: cash, note: 'Cash expense' });
    if (bank) lines.push({ code: '1010', debit: 0, credit: bank, note: 'Bank expense' });
    postJournal(user.companyId, purchase.doc_date, 'PUR', 'PURCHASE', purchase.id, purchase.doc_no, lines);
    if (purchase.advance > 0) {
      postJournal(user.companyId, purchase.doc_date, 'PAY', 'PURCHASE', purchase.id, `Advance ${purchase.doc_no}`, [
        { code: '2000', partyType: 'SUPPLIER', partyId: purchase.supplier_id, debit: purchase.advance, credit: 0, note: 'Advance' },
        { code: '1000', debit: 0, credit: purchase.advance, note: 'Cash' },
      ]);
    }
    for (const item of items) {
      const value = money(item.taxable + item.expense_share);
      receiveStock(user.companyId, item.product_id, purchase.warehouse_id, item.id, Number(item.net_qtl) * 100, value, 'PURCHASE', purchase.id);
    }
    db.prepare(`UPDATE purchases SET status = 'POSTED' WHERE id = ?`).run(id);
    audit(user.companyId, user.username, 'POST', 'PURCHASE', id, purchase.doc_no);
    return camel(own('purchases', id, user.companyId));
  });
}

export function cancelPurchase(user, id) {
  return tx(() => {
    const purchase = own('purchases', id, user.companyId);
    if (purchase.status !== 'POSTED') fail(409, 'Posted purchase hi cancel hoti hai.');
    reverseJournals(user.companyId, 'PURCHASE', id, todayISO());
    reverseStock(user.companyId, 'PURCHASE', id);
    db.prepare(`UPDATE purchases SET status = 'CANCELLED' WHERE id = ?`).run(id);
    audit(user.companyId, user.username, 'CANCEL', 'PURCHASE', id, purchase.doc_no);
    return camel(own('purchases', id, user.companyId));
  });
}

export function saveSale(user, body) {
  return tx(() => {
    const company = companyOf(user.companyId);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?').get(body.customerId, user.companyId);
    if (!customer) fail(400, 'Customer choose karein.');
    const date = body.docDate || todayISO();
    const docNo = body.docNo ? String(body.docNo).trim() : nextNumber(user.companyId, 'SAL', date);
    const sale = db.prepare(`INSERT INTO sales (company_id, customer_id, warehouse_id, broker_id, doc_no, doc_date, status, vehicle_no, driver_name, driver_mobile, advance, remarks)
      VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?) RETURNING *`).get(user.companyId, customer.id, body.warehouseId, body.brokerId || null, docNo, date, body.vehicleNo || '', body.driverName || '', body.driverMobile || '', money(body.advance), body.remarks || '');
    priceSale(company, customer, sale, body.lines || []);
    audit(user.companyId, user.username, 'CREATE', 'SALE', sale.id, docNo);
    return camel(db.prepare('SELECT * FROM sales WHERE id = ?').get(sale.id));
  });
}

function priceSale(company, customer, sale, lines) {
  const intra = sameState(company, customer);
  db.prepare('DELETE FROM sales_items WHERE sales_id = ?').run(sale.id);
  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const line of lines) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(line.productId);
    const gstRate = line.gstRate == null ? Number(product?.gst_rate || 0) : Number(line.gstRate);
    const base = lineTaxable(line.quantityQtl, line.rate, line.discount);
    const tax = gstSplit(base, gstRate, intra);
    const lineTotal = money(base + tax.cgst + tax.sgst + tax.igst);
    db.prepare(`INSERT INTO sales_items (sales_id, product_id, bags, quantity_qtl, rate, hsn_code, gst_rate, discount, taxable, cgst, sgst, igst, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(sale.id, line.productId, qty(line.bags), qty(line.quantityQtl), money(line.rate), line.hsnCode || product?.hsn_code || '', gstRate, money(line.discount), base, tax.cgst, tax.sgst, tax.igst, lineTotal);
    taxable = money(taxable + base);
    cgst = money(cgst + tax.cgst);
    sgst = money(sgst + tax.sgst);
    igst = money(igst + tax.igst);
  }
  const raw = taxable + cgst + sgst + igst;
  const roundOff = roundOffToRupee(raw);
  const total = money(raw + roundOff);
  db.prepare('UPDATE sales SET taxable=?, cgst=?, sgst=?, igst=?, round_off=?, total=? WHERE id=?').run(taxable, cgst, sgst, igst, roundOff, total, sale.id);
}

export function postSale(user, id) {
  return tx(() => {
    const sale = own('sales', id, user.companyId);
    if (sale.status !== 'DRAFT') fail(409, 'Sirf draft invoice post hoti hai.');
    const company = companyOf(user.companyId);
    const items = db.prepare('SELECT * FROM sales_items WHERE sales_id = ?').all(id);
    const lines = [{ code: '1100', partyType: 'CUSTOMER', partyId: sale.customer_id, debit: sale.total, credit: 0, note: 'Customer' }];
    lines.push({ code: '4000', debit: 0, credit: sale.taxable, note: 'Sales' });
    if (sale.cgst) lines.push({ code: '2100', debit: 0, credit: sale.cgst, note: 'Output CGST' });
    if (sale.sgst) lines.push({ code: '2110', debit: 0, credit: sale.sgst, note: 'Output SGST' });
    if (sale.igst) lines.push({ code: '2120', debit: 0, credit: sale.igst, note: 'Output IGST' });
    if (sale.round_off < 0) lines.push({ code: '5400', debit: money(-sale.round_off), credit: 0, note: 'Round off' });
    if (sale.round_off > 0) lines.push({ code: '5400', debit: 0, credit: sale.round_off, note: 'Round off' });
    postJournal(user.companyId, sale.doc_date, 'SAL', 'SALE', sale.id, sale.doc_no, lines);
    let cogs = 0;
    for (const item of items) {
      const cost = issueStock(company, item.product_id, sale.warehouse_id, Number(item.quantity_qtl) * 100, 'SALE', sale.id);
      cogs = money(cogs + cost);
      db.prepare('UPDATE sales_items SET cogs = ? WHERE id = ?').run(cost, item.id);
    }
    if (cogs) {
      postJournal(user.companyId, sale.doc_date, 'COGS', 'SALE', sale.id, `COGS ${sale.doc_no}`, [
        { code: '5000', debit: cogs, credit: 0, note: 'COGS' },
        { code: '1200', debit: 0, credit: cogs, note: 'Stock out' },
      ]);
    }
    if (sale.advance > 0) {
      postJournal(user.companyId, sale.doc_date, 'RCT', 'SALE', sale.id, `Advance ${sale.doc_no}`, [
        { code: '1000', debit: sale.advance, credit: 0, note: 'Cash' },
        { code: '1100', partyType: 'CUSTOMER', partyId: sale.customer_id, debit: 0, credit: sale.advance, note: 'Advance' },
      ]);
    }
    db.prepare(`UPDATE sales SET status = 'POSTED' WHERE id = ?`).run(id);
    audit(user.companyId, user.username, 'POST', 'SALE', id, sale.doc_no);
    return camel(own('sales', id, user.companyId));
  });
}

export function cancelSale(user, id) {
  return tx(() => {
    const sale = own('sales', id, user.companyId);
    if (sale.status !== 'POSTED') fail(409, 'Posted invoice hi cancel hoti hai.');
    const dispatch = db.prepare('SELECT id FROM dispatches WHERE sales_id = ? LIMIT 1').get(id);
    if (dispatch) fail(409, 'Dispatch bani hui invoice cancel nahi hoti.');
    reverseJournals(user.companyId, 'SALE', id, todayISO());
    reverseStock(user.companyId, 'SALE', id);
    db.prepare(`UPDATE sales SET status = 'CANCELLED' WHERE id = ?`).run(id);
    audit(user.companyId, user.username, 'CANCEL', 'SALE', id, sale.doc_no);
    return camel(own('sales', id, user.companyId));
  });
}

export function createDispatch(user, body) {
  return tx(() => {
    const sale = own('sales', body.salesId, user.companyId);
    if (sale.status !== 'POSTED') fail(409, 'Dispatch posted sale par hota hai.');
    const note = db.prepare(`INSERT INTO dispatches (company_id, sales_id, dispatch_date, status, destination, remarks) VALUES (?, ?, ?, 'IN_TRANSIT', ?, ?) RETURNING *`)
      .get(user.companyId, sale.id, body.dispatchDate || todayISO(), body.destination || '', body.remarks || '');
    let freight = 0;
    for (const line of body.items || []) {
      const itemFreight = money(Number(line.freight || 0) + Number(line.loading || 0) + Number(line.unloading || 0));
      freight = money(freight + itemFreight);
      db.prepare(`INSERT INTO dispatch_items (dispatch_id, sales_item_id, product_id, bags, weight_qtl, vehicle_no, driver_name, driver_mobile, transporter_id, freight, loading, unloading, lr_number, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(note.id, line.salesItemId || null, line.productId, qty(line.bags), qty(line.weightQtl), line.vehicleNo || '', line.driverName || '', line.driverMobile || '', line.transporterId || null, money(line.freight), money(line.loading), money(line.unloading), line.lrNumber || '', line.remarks || '');
    }
    if (freight) {
      postJournal(user.companyId, note.dispatch_date, 'EXP', 'DISPATCH', note.id, `Freight sale ${sale.doc_no}`, [
        { code: '5200', debit: freight, credit: 0, note: 'Freight and loading' },
        { code: '1000', debit: 0, credit: freight, note: 'Paid' },
      ]);
    }
    audit(user.companyId, user.username, 'CREATE', 'DISPATCH', note.id, sale.doc_no);
    return camel(note);
  });
}

export function receiveGoods(user, body) {
  return tx(() => {
    const item = db.prepare('SELECT * FROM dispatch_items WHERE id = ?').get(body.dispatchItemId);
    if (!item) fail(404, 'Dispatch item nahi mila.');
    const note = own('dispatches', item.dispatch_id, user.companyId);
    const receipt = db.prepare('INSERT INTO goods_receipts (dispatch_id, dispatch_item_id, received_date, received_qtl, remarks) VALUES (?, ?, ?, ?, ?) RETURNING *')
      .get(note.id, item.id, body.receivedDate || todayISO(), qty(body.receivedQtl), body.remarks || '');
    const received = db.prepare('SELECT COALESCE(SUM(received_qtl), 0) AS qty FROM goods_receipts WHERE dispatch_item_id = ?').get(item.id).qty;
    const status = Number(received) + 0.001 < Number(item.weight_qtl) ? 'PART_RECEIVED' : 'RECEIVED';
    db.prepare('UPDATE dispatches SET status = ? WHERE id = ?').run(status, note.id);
    if (body.createClaim !== false) openClaim(user, note, item, Number(received), body.rate == null ? null : Number(body.rate));
    return camel(receipt);
  });
}

function saleRate(item) {
  if (!item.sales_item_id) return 0;
  return Number(db.prepare('SELECT rate FROM sales_items WHERE id = ?').get(item.sales_item_id)?.rate || 0);
}

function openClaim(user, note, item, received, rate) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(note.sales_id);
  const useRate = rate == null ? saleRate(item) : rate;
  const calc = shortage(item.weight_qtl, received, useRate);
  let claim = db.prepare(`SELECT * FROM weight_adjustments WHERE dispatch_item_id = ? AND status IN ('DRAFT','PENDING')`).get(item.id);
  if (!claim) {
    claim = db.prepare(`INSERT INTO weight_adjustments (company_id, dispatch_item_id, sales_id, customer_id, product_id, status) VALUES (?, ?, ?, ?, ?, 'PENDING') RETURNING *`)
      .get(user.companyId, item.id, sale.id, sale.customer_id, item.product_id);
  }
  db.prepare(`UPDATE weight_adjustments SET dispatch_qtl=?, received_qtl=?, shortage_qtl=?, shortage_percent=?, rate=?, claim_amount=?, status='PENDING' WHERE id=?`)
    .run(item.weight_qtl, received, calc.shortageQtl, calc.percent, useRate, calc.amount, claim.id);
  db.prepare('INSERT INTO adjustment_events (adjustment_id, action, amount, note, username, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(claim.id, 'CLAIM', calc.amount, 'Receipt updated the claim', user.username, new Date().toISOString());
}

export function decideAdjustment(user, id, status, approvedAmount, note) {
  return tx(() => {
    const claim = own('weight_adjustments', id, user.companyId);
    if (claim.status !== 'PENDING' && claim.status !== 'DRAFT') fail(409, 'Yeh claim pehle decide ho chuka hai.');
    const amount = status === 'APPROVED' ? money(approvedAmount == null ? claim.claim_amount : approvedAmount) : 0;
    if (status === 'APPROVED' && amount > 0) {
      postJournal(user.companyId, todayISO(), 'ADJ', 'ADJUSTMENT', claim.id, 'Weight shortage', [
        { code: '5100', debit: amount, credit: 0, note: 'Shortage loss' },
        { code: '1100', partyType: 'CUSTOMER', partyId: claim.customer_id, debit: 0, credit: amount, note: 'Customer claim' },
      ]);
    } else if (status === 'APPROVED' && amount < 0) {
      postJournal(user.companyId, todayISO(), 'ADJ', 'ADJUSTMENT', claim.id, 'Weight excess', [
        { code: '1100', partyType: 'CUSTOMER', partyId: claim.customer_id, debit: money(-amount), credit: 0, note: 'Customer' },
        { code: '5100', debit: 0, credit: money(-amount), note: 'Excess weight' },
      ]);
    }
    db.prepare('UPDATE weight_adjustments SET status = ?, approved_amount = ?, reason = ? WHERE id = ?').run(status, status === 'APPROVED' ? amount : null, note || '', id);
    db.prepare('INSERT INTO adjustment_events (adjustment_id, action, amount, note, username, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, status, amount, note || '', user.username, new Date().toISOString());
    audit(user.companyId, user.username, status, 'ADJUSTMENT', id, note || '');
    return camel(own('weight_adjustments', id, user.companyId));
  });
}

export function saveExpense(user, body) {
  return tx(() => {
    const category = db.prepare('SELECT * FROM expense_categories WHERE id = ? AND company_id = ?').get(body.categoryId, user.companyId);
    if (!category) fail(400, 'Expense head choose karein.');
    const amount = money(body.amount);
    if (amount <= 0) fail(400, 'Amount likhein.');
    const accountCode = body.payMode === 'CASH' ? '1000' : '1010';
    const row = db.prepare(`INSERT INTO expenses (company_id, category_id, expense_date, amount, pay_mode, account_id, vendor_name, vehicle_no, purchase_id, sales_id, dispatch_id, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).get(user.companyId, category.id, body.expenseDate || todayISO(), amount, body.payMode || 'CASH', body.accountId || null, body.vendorName || '', body.vehicleNo || '', body.purchaseId || null, body.salesId || null, body.dispatchId || null, body.remarks || '');
    postJournal(user.companyId, row.expense_date, 'EXP', 'EXPENSE', row.id, category.name, [
      { code: category.direct_cost ? '5200' : '5300', debit: amount, credit: 0, note: category.name },
      { code: accountCode, debit: 0, credit: amount, note: body.payMode || 'CASH' },
    ]);
    audit(user.companyId, user.username, 'CREATE', 'EXPENSE', row.id, category.name);
    return camel(row);
  });
}

export function savePayment(user, body) {
  return tx(() => {
    const amount = money(body.amount);
    if (amount <= 0) fail(400, 'Amount likhein.');
    const chosen = body.accountId ? db.prepare('SELECT * FROM accounts WHERE id = ? AND company_id = ?').get(body.accountId, user.companyId) : account(user.companyId, '1000');
    if (!chosen) fail(400, 'Account choose karein.');
    const row = db.prepare(`INSERT INTO payments (company_id, payment_type, party_type, party_id, account_id, pay_date, amount, pay_mode, purchase_id, sales_id, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).get(user.companyId, body.paymentType, body.partyType, body.partyId, chosen.id, body.payDate || todayISO(), amount, body.payMode || 'CASH', body.purchaseId || null, body.salesId || null, body.remarks || '');
    if (body.paymentType === 'PAYMENT') {
      postJournal(user.companyId, row.pay_date, 'PAY', 'PAYMENT', row.id, 'Supplier payment', [
        { code: '2000', partyType: 'SUPPLIER', partyId: row.party_id, debit: amount, credit: 0, note: 'Supplier' },
        { code: chosen.code, debit: 0, credit: amount, note: 'Money out' },
      ]);
    } else {
      postJournal(user.companyId, row.pay_date, 'RCT', 'PAYMENT', row.id, 'Customer receipt', [
        { code: chosen.code, debit: amount, credit: 0, note: 'Money in' },
        { code: '1100', partyType: 'CUSTOMER', partyId: row.party_id, debit: 0, credit: amount, note: 'Customer' },
      ]);
    }
    audit(user.companyId, user.username, 'CREATE', 'PAYMENT', row.id, body.paymentType);
    return camel(row);
  });
}

export function own(table, id, companyId) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND company_id = ?`).get(id, companyId);
  if (!row) fail(404, 'Record nahi mila.');
  return row;
}

export function listOwned(table, companyId) {
  return rows(db.prepare(`SELECT * FROM ${table} WHERE company_id = ? ORDER BY id DESC`).all(companyId));
}

export function saleWords(id) {
  const sale = db.prepare('SELECT total FROM sales WHERE id = ?').get(id);
  return sale ? inWords(sale.total) : '';
}

export function seedDemo() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
    const user = db.prepare('INSERT INTO users (company_id, full_name, username, password_hash) VALUES (1, ?, ?, ?) RETURNING id')
      .get('Abhishek Traders', 'admin', hashPassword('Admin@123'));
    db.prepare('INSERT INTO user_roles (user_id, role_name) VALUES (?, ?)').run(user.id, 'SUPER_ADMIN');
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM purchases').get().n > 0) return;
  const user = { companyId: 1, username: 'admin' };
  const purchase = savePurchase(user, {
    supplierId: 1, warehouseId: 1, docDate: todayISO(), advance: 0, remarks: 'Opening mandi purchase',
    lines: [{ productId: 2, bags: 440, grossQtl: 246.32, tareQtl: 0, netQtl: 246.32, rate: 2400, gstRate: 0 }],
    expenses: [{ categoryId: 5, description: 'Hamali', amount: 2200, settlement: 'CASH' }],
  });
  postPurchase(user, purchase.id);
  const sale = saveSale(user, {
    customerId: 1, warehouseId: 1, docDate: todayISO(), vehicleNo: 'RJ09GC7788', driverName: 'Ramesh', driverMobile: '9000000004', advance: 0,
    lines: [{ productId: 2, bags: 200, quantityQtl: 100, rate: 2560, discount: 0, gstRate: 0, hsnCode: '10059000' }],
  });
  postSale(user, sale.id);
}

export function dashboard(companyId, from, to) {
  const today = todayISO();
  const sum = (sql, ...args) => Number(db.prepare(sql).get(companyId, ...args)?.n || 0);
  const profit = profitFor(companyId, from, to);
  return {
    todayPurchase: sum(`SELECT COALESCE(SUM(total_cost),0) AS n FROM purchases WHERE company_id=? AND status='POSTED' AND doc_date=?`, today),
    todaySales: sum(`SELECT COALESCE(SUM(total),0) AS n FROM sales WHERE company_id=? AND status='POSTED' AND doc_date=?`, today),
    todayExpenses: sum(`SELECT COALESCE(SUM(amount),0) AS n FROM expenses WHERE company_id=? AND expense_date=?`, today),
    stockQtl: kgToQtl(sum('SELECT COALESCE(SUM(qty_kg),0) AS n FROM stock_ledger WHERE company_id=?')),
    receivables: partyBalance(companyId, '1100'),
    payables: partyBalance(companyId, '2000'),
    shortageQtl: sum(`SELECT COALESCE(SUM(shortage_qtl),0) AS n FROM weight_adjustments WHERE company_id=? AND status='APPROVED'`),
    pendingDispatches: sum(`SELECT COUNT(*) AS n FROM dispatches WHERE company_id=? AND status IN ('IN_TRANSIT','PART_RECEIVED')`),
    pendingReceipts: sum(`SELECT COUNT(*) AS n FROM dispatches WHERE company_id=? AND status='PART_RECEIVED'`),
    ...profit,
    monthlySales: monthly(companyId, 'sales', 'total', from, to),
    monthlyPurchase: monthly(companyId, 'purchases', 'total_cost', from, to),
    from, to,
  };
}

function partyBalance(companyId, code) {
  const row = db.prepare(`SELECT COALESCE(SUM(l.debit - l.credit),0) AS n FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE e.company_id = ? AND a.code = ?`).get(companyId, code);
  const amount = money(row.n);
  return code === '2000' ? money(-amount) : amount;
}

function accountNet(companyId, code, from, to, income) {
  const row = db.prepare(`SELECT COALESCE(SUM(l.credit - l.debit),0) AS n FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE e.company_id = ? AND a.code = ? AND e.entry_date BETWEEN ? AND ?`).get(companyId, code, from, to);
  const netCredit = money(row.n);
  return income ? netCredit : money(-netCredit);
}

function profitFor(companyId, from, to) {
  const sales = accountNet(companyId, '4000', from, to, true);
  const cogs = accountNet(companyId, '5000', from, to, false);
  const shortageLoss = accountNet(companyId, '5100', from, to, false);
  const directExpenses = accountNet(companyId, '5200', from, to, false);
  const indirectExpenses = accountNet(companyId, '5300', from, to, false);
  const roundOff = accountNet(companyId, '5400', from, to, false);
  const grossProfit = money(sales - cogs);
  const netProfit = money(grossProfit - shortageLoss - directExpenses - indirectExpenses - roundOff);
  return { sales, cogs, grossProfit, shortageLoss, directExpenses, indirectExpenses, roundOff, netProfit };
}

function monthly(companyId, table, column, from, to) {
  return db.prepare(`SELECT substr(doc_date,1,7) AS month, COALESCE(SUM(${column}),0) AS amount FROM ${table}
    WHERE company_id = ? AND status = 'POSTED' AND doc_date BETWEEN ? AND ? GROUP BY 1 ORDER BY 1`).all(companyId, from, to);
}

export function trialBalance(companyId, from, to) {
  return db.prepare(`SELECT a.code, a.name, a.account_type AS type, COALESCE(SUM(l.debit),0) AS debit, COALESCE(SUM(l.credit),0) AS credit
    FROM accounts a LEFT JOIN journal_lines l ON l.account_id = a.id
    LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.entry_date BETWEEN ? AND ?
    WHERE a.company_id = ? GROUP BY a.code, a.name, a.account_type ORDER BY a.code`).all(from, to, companyId)
    .filter((row) => Number(row.debit) || Number(row.credit));
}

export function ledger(partyType, partyId) {
  const lines = db.prepare(`SELECT e.entry_date AS date, e.voucher_no AS voucher, e.narration, l.debit, l.credit
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
    WHERE l.party_type = ? AND l.party_id = ? ORDER BY e.entry_date, l.id`).all(partyType, partyId);
  let balance = 0;
  return lines.map((line) => {
    balance = money(balance + Number(line.debit) - Number(line.credit));
    return { ...line, balance };
  });
}

export function stockReport(companyId) {
  return db.prepare(`SELECT p.name AS product, w.name AS warehouse, COALESCE(SUM(s.qty_kg),0) AS kg, COALESCE(SUM(s.value_amount),0) AS value
    FROM stock_ledger s JOIN products p ON p.id = s.product_id JOIN warehouses w ON w.id = s.warehouse_id
    WHERE s.company_id = ? GROUP BY p.name, w.name HAVING ABS(SUM(s.qty_kg)) > 0.001 ORDER BY p.name`).all(companyId)
    .map((row) => ({ ...row, quintal: kgToQtl(row.kg) }));
}

export function commodityProfit(companyId, from, to) {
  return db.prepare(`SELECT p.name AS commodity, COALESCE(SUM(i.taxable),0) AS revenue, COALESCE(SUM(i.cogs),0) AS cogs, COALESCE(SUM(i.quantity_qtl),0) AS quintal
    FROM sales_items i JOIN sales s ON s.id = i.sales_id JOIN products p ON p.id = i.product_id
    WHERE s.company_id = ? AND s.status = 'POSTED' AND s.doc_date BETWEEN ? AND ? GROUP BY p.name ORDER BY p.name`).all(companyId, from, to)
    .map((row) => ({ ...row, profit: money(row.revenue - row.cogs) }));
}

export function documents(companyId, kind, from, to) {
  const map = {
    purchases: `SELECT * FROM purchases WHERE company_id = ? AND doc_date BETWEEN ? AND ? ORDER BY doc_date DESC`,
    sales: `SELECT * FROM sales WHERE company_id = ? AND doc_date BETWEEN ? AND ? ORDER BY doc_date DESC`,
    expenses: `SELECT * FROM expenses WHERE company_id = ? AND expense_date BETWEEN ? AND ? ORDER BY expense_date DESC`,
    dispatches: `SELECT * FROM dispatches WHERE company_id = ? AND dispatch_date BETWEEN ? AND ? ORDER BY dispatch_date DESC`,
    adjustments: `SELECT * FROM weight_adjustments WHERE company_id = ? ORDER BY id DESC`,
  };
  if (!map[kind]) return [];
  const statement = db.prepare(map[kind]);
  const list = kind === 'adjustments' ? statement.all(companyId) : statement.all(companyId, from, to);
  return rows(list);
}

export { inWords };
