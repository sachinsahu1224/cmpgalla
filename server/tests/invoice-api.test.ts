import request from 'supertest';
import { createApp } from '../src/app';
import { buildNicInvoice } from '../src/gst/payload';
import { submitToPortal } from '../src/gst/portal';
import { priceInvoice } from '../src/invoice-calc';
import { prisma } from '../src/prisma';

const app = createApp();

async function token() {
  const response = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Admin@123' });
  return response.body.token as string;
}

describe('sales invoice API', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('saves the soyabeen invoice, blocks a fake IRN, and keeps a second click from calling again', async () => {
    const auth = await token();
    const customers = await request(app).get('/api/customers').set('Authorization', `Bearer ${auth}`);
    const buyer = customers.body.find((row: { gstin: string }) => row.gstin === '23CDGPR7584H1Z3');
    const products = await request(app).get('/api/products').set('Authorization', `Bearer ${auth}`);
    const soyabeen = products.body.find((row: { name: string }) => row.name === 'Soyabeen');
    const body = {
      number: '48',
      invoiceDate: '2025-11-23',
      customerId: buyer.id,
      placeOfSupply: '23',
      lines: [{
        productId: soyabeen.id,
        description: 'Soyabeen',
        hsnCode: '12019000',
        bags: '350',
        quantity: '313.95',
        quantityUnit: 'QTL',
        rate: '4507',
        rateUnit: 'QTL',
        discount: '0',
        shortageQty: '0',
        bardanaAmount: '0',
      }],
      vehicleNo: 'RJ09GC7788',
      transporterName: 'Sample Transport',
      transportMode: 'ROAD',
      distanceKm: 67,
    };
    const created = await request(app).post('/api/invoices').set('Authorization', `Bearer ${auth}`).send(body);
    expect(created.status).toBe(201);
    expect(created.body.taxable).toBe('1414972.65');
    expect(created.body.cgst).toBe('35374.32');
    expect(created.body.total).toBe('1485721.00');
    expect(created.body.words).toContain('Fourteen Lakh Eighty Five Thousand');

    const finalised = await request(app).post(`/api/invoices/${created.body.id}/finalise`).set('Authorization', `Bearer ${auth}`);
    expect(finalised.status).toBe(200);
    const blocked = await request(app).put(`/api/invoices/${created.body.id}`).set('Authorization', `Bearer ${auth}`).send(body);
    expect(blocked.status).toBe(409);

    const first = await request(app).post(`/api/invoices/${created.body.id}/einvoice`).set('Authorization', `Bearer ${auth}`).send({});
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('MOCK');
    expect(first.body.irn).toBeNull();
    expect(first.body.signedQr).toBeNull();
    expect(first.body.irnInvented).toBe(false);
    expect(first.body.portalMessage).toContain('MOCK / TEST ONLY');
    const second = await request(app).post(`/api/invoices/${created.body.id}/einvoice`).set('Authorization', `Bearer ${auth}`).send({});
    expect(second.body.id).toBe(first.body.id);

    const eway = await request(app).post(`/api/invoices/${created.body.id}/eway`).set('Authorization', `Bearer ${auth}`).send({});
    expect(eway.body.status).toBe('MOCK');
    expect(eway.body.ewayNo).toBeNull();
    expect(eway.body.invented).toBe(false);
    expect(eway.body.portalMessage).toContain('MOCK / TEST ONLY');
    const vehicle = await request(app).post(`/api/invoices/${created.body.id}/eway/vehicle`).set('Authorization', `Bearer ${auth}`).send({ vehicleNo: 'MP09HG1145', reason: '1', remark: 'change' });
    expect(vehicle.status).toBe(409);

    const pdf = await request(app).get(`/api/invoices/${created.body.id}/pdf`).set('Authorization', `Bearer ${auth}`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('does not request an e-way bill at or below Rs 50,000', async () => {
    const auth = await token();
    const customers = await request(app).get('/api/customers').set('Authorization', `Bearer ${auth}`);
    const buyer = customers.body.find((row: { gstin: string }) => row.gstin === '23CDGPR7584H1Z3');
    const created = await request(app).post('/api/invoices').set('Authorization', `Bearer ${auth}`).send({
      number: '49',
      invoiceDate: '2025-11-23',
      customerId: buyer.id,
      placeOfSupply: '23',
      lines: [{
        description: 'Sample',
        hsnCode: '10019910',
        quantity: '1',
        quantityUnit: 'QTL',
        rate: '1000',
        rateUnit: 'QTL',
      }],
      vehicleNo: 'MP09HG1145',
      transportMode: 'ROAD',
      distanceKm: 10,
    });
    expect(created.status).toBe(201);
    await request(app).post(`/api/invoices/${created.body.id}/finalise`).set('Authorization', `Bearer ${auth}`);
    const eway = await request(app).post(`/api/invoices/${created.body.id}/eway`).set('Authorization', `Bearer ${auth}`).send({});
    expect(eway.body.status).toBe('NOT_APPLICABLE');
    expect(eway.body.ewayNo).toBeNull();
  });

  it('refuses production mode unless the server flag is on', async () => {
    const auth = await token();
    const current = await request(app).get('/api/company').set('Authorization', `Bearer ${auth}`);
    const saved = await request(app).put('/api/company').set('Authorization', `Bearer ${auth}`).send({ ...current.body, integrationMode: 'PRODUCTION' });
    expect(saved.status).toBe(400);
    let called = false;
    const outcome = await submitToPortal({
      kind: 'irp',
      mode: 'PRODUCTION',
      path: '/eicore/v1.03/Invoice',
      credentials: { gstin: '23AXQPJ6375E1Z9', clientId: 'id', clientSecret: 'secret', username: 'user', password: 'password', publicKey: 'key' },
      payload: { Version: '1.1' },
      fetchImpl: async () => {
        called = true;
        return new Response('{}');
      },
    });
    expect(called).toBe(false);
    expect(outcome.irn).toBeNull();
    expect(outcome.message).toContain('disabled');
  });
});

describe('NIC payload', () => {
  it('puts the soyabeen taxable value and rupee total on the IRP payload', () => {
    const priced = priceInvoice([
      { description: 'Soyabeen', hsnCode: '12019000', quantity: '313.95', quantityUnit: 'QTL', rate: '4507', rateUnit: 'QTL', gstRate: '5' },
    ], { shortageMode: 'NONE', bardanaMode: 'NONE', bardanaRate: '0' }, true);
    const payload = buildNicInvoice(
      { gstin: '23AXQPJ6375E1Z9', legalName: 'Abhishek Traders', address: 'Rahatgarh', location: 'Rahatgarh', pincode: '470119', stateCode: '23' },
      { gstin: '23CDGPR7584H1Z3', legalName: 'KESHAR ENTERPRISE', address: 'Basoda', location: 'Vidisha', pincode: '464221', stateCode: '23' },
      priced,
      { number: '48', invoiceDate: '2025-11-23', placeOfSupply: '23' },
    );
    const values = payload['ValDtls'] as { AssVal: number; TotInvVal: number; RndOffAmt: number };
    expect(values.AssVal).toBe(1414972.65);
    expect(values.TotInvVal).toBe(1485721);
    expect(values.RndOffAmt).toBe(-0.29);
  });
});
