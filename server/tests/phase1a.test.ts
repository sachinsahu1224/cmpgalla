import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/prisma';

const app = createApp();

async function login() {
  const response = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Admin@123' });
  expect(response.status).toBe(200);
  return response.body.token as string;
}

describe('phase 1A masters', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a missing token and a wrong password', async () => {
    const closed = await request(app).get('/api/company');
    expect(closed.status).toBe(401);
    const wrong = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong-password' });
    expect(wrong.status).toBe(401);
  });

  it('returns the company without GST secrets', async () => {
    const token = await login();
    const response = await request(app).get('/api/company').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.gstin).toBe('23AXQPJ6375E1Z9');
    expect(response.body.tradeName).toBe('Abhishek Traders');
    expect(response.body.irpPassword).toBeUndefined();
    expect(response.body.irpClientSecret).toBeUndefined();
    expect(response.body.ewbPublicKey).toBeUndefined();
  });

  it('saves a GST password on the server and does not send it back', async () => {
    const token = await login();
    const current = await request(app).get('/api/company').set('Authorization', `Bearer ${token}`);
    const saved = await request(app)
      .put('/api/company')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...current.body, phone: '9300073913', irpPassword: 'sandbox-password' });
    expect(saved.status).toBe(200);
    expect(saved.body.phone).toBe('9300073913');
    expect(saved.body.irpPassword).toBeUndefined();
    expect(saved.body.irpPasswordSet).toBe(true);
    const again = await request(app)
      .put('/api/company')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...current.body, phone: '8269129464', irpPassword: '' });
    expect(again.status).toBe(200);
    expect(again.body.phone).toBe('8269129464');
    expect(again.body.irpPasswordSet).toBe(true);
  });

  it('creates a customer and a product, then counts them on the dashboard', async () => {
    const token = await login();
    const before = await request(app).get('/api/summary').set('Authorization', `Bearer ${token}`);
    const customer = await request(app).post('/api/customers').set('Authorization', `Bearer ${token}`).send({
      name: 'JK TRADERS',
      address: 'Ganibasoda',
      city: 'Ganjbasoda',
      pincode: '464221',
      gstin: '23DUPPR1827A1ZQ',
      stateName: 'Madhya Pradesh',
      stateCode: '23',
      mobile: '',
      openingBalance: '0.00',
      creditLimit: '0.00',
      active: true,
    });
    expect(customer.status).toBe(201);
    expect(customer.body.openingBalance).toBe('0.00');
    const bad = await request(app).post('/api/customers').set('Authorization', `Bearer ${token}`).send({
      ...customer.body,
      name: 'Bad GSTIN',
      gstin: 'NOT-A-GSTIN',
    });
    expect(bad.status).toBe(400);
    const hsn = await request(app).get('/api/hsn').set('Authorization', `Bearer ${token}`);
    const wheat = hsn.body.find((row: { code: string }) => row.code === '10019910');
    const product = await request(app).post('/api/products').set('Authorization', `Bearer ${token}`).send({
      name: 'Gehun',
      unit: 'QTL',
      hsnId: wheat.id,
      active: true,
    });
    expect(product.status).toBe(201);
    expect(product.body.gstRate).toBe('0.00');
    expect(product.body.hsn.code).toBe('10019910');
    const after = await request(app).get('/api/summary').set('Authorization', `Bearer ${token}`);
    expect(after.body.customers).toBe(before.body.customers + 1);
    expect(after.body.products).toBe(before.body.products + 1);
    const audit = await prisma.auditLog.findFirst({ where: { entity: 'customer', entityId: customer.body.id } });
    expect(audit?.action).toBe('CREATE');
  });
});
