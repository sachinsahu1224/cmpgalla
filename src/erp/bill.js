import { inWords } from '../money.js';
import { camel, db, fail, rows } from './db.js';
import { saveSale } from './books.js';

export function saveBill(user, body) {
  if (!String(body.buyerName || '').trim()) fail(400, 'Buyer ka naam likhein.');
  if (!body.productId) fail(400, 'Maal choose karein.');
  if (!(Number(body.quantityQtl) > 0)) fail(400, 'Quantity likhein.');
  const customerId = upsertCustomer(user, body);
  const warehouse = db.prepare('SELECT id FROM warehouses WHERE company_id = ? ORDER BY id LIMIT 1').get(user.companyId);
  const sale = saveSale(user, {
    customerId,
    warehouseId: warehouse?.id || null,
    docNo: body.docNo || '',
    docDate: body.docDate,
    vehicleNo: body.vehicleNo || '',
    driverName: body.driverName || '',
    driverMobile: body.driverMobile || '',
    advance: 0,
    remarks: '',
    lines: [{
      productId: Number(body.productId),
      bags: Number(body.bags || 0),
      quantityQtl: Number(body.quantityQtl),
      rate: Number(body.rate || 0),
      discount: Number(body.cashDiscount || 0),
      gstRate: body.gstRate == null ? null : Number(body.gstRate),
      hsnCode: body.hsnCode || '',
    }],
  });
  db.prepare(`UPDATE sales SET broker=?, place=?, bilti_no=?, bilti_date=?, transporter_name=?, freight_note=?, distance=?, cash_discount=? WHERE id=?`)
    .run(body.broker || '', body.place || '', body.biltiNo || '', body.biltiDate || body.docDate || '', body.transporterName || '', body.freightNote || '', Number(body.distance || 0), Number(body.cashDiscount || 0), sale.id);
  return getBill(user, sale.id);
}

export function listBills(companyId) {
  return rows(db.prepare('SELECT id, doc_no, doc_date, status, total, vehicle_no, customer_id FROM sales WHERE company_id = ? ORDER BY id DESC LIMIT 20').all(companyId));
}

export function getBill(user, id) {
  const sale = camel(db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(id, user.companyId));
  if (!sale) fail(404, 'Bill nahi mili.');
  const items = rows(db.prepare(`SELECT i.*, p.name AS product_name FROM sales_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.sales_id = ?`).all(id));
  const customer = camel(db.prepare('SELECT * FROM customers WHERE id = ?').get(sale.customerId));
  const einvoice = camel(db.prepare('SELECT * FROM einvoice_records WHERE sales_id = ? ORDER BY id DESC LIMIT 1').get(id));
  const eway = camel(db.prepare('SELECT * FROM eway_records WHERE sales_id = ? ORDER BY id DESC LIMIT 1').get(id));
  return { sale, items, customer, einvoice, eway, words: inWords(sale.total) };
}

function upsertCustomer(user, body) {
  const values = [body.buyerName, body.buyerAddress || '', body.buyerCity || body.buyerAddress || '', body.buyerPincode || '', body.buyerGstin || '', body.buyerState || '', body.buyerStateCode || ''];
  if (body.customerId) {
    db.prepare('UPDATE customers SET name=?, address=?, city=?, pincode=?, gstin=?, state_name=?, state_code=? WHERE id=? AND company_id=?')
      .run(...values, body.customerId, user.companyId);
    return Number(body.customerId);
  }
  const created = db.prepare(`INSERT INTO customers (company_id, name, address, city, pincode, gstin, state_name, state_code, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) RETURNING id`).get(user.companyId, ...values);
  return created.id;
}
