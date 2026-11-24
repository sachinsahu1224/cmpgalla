import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireWriter } from '../auth';
import { writeAudit } from '../audit';
import { httpError } from '../errors';
import { prisma } from '../prisma';
import { customerSchema, parseBody } from '../validate';

export const customerRouter = Router();
customerRouter.use(requireAuth);

customerRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const rows = await prisma.customer.findMany({
      where: {
        companyId: req.user!.cid,
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { gstin: { contains: search, mode: 'insensitive' } }, { city: { contains: search, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
    res.json(rows.map(present));
  } catch (error) {
    next(error);
  }
});

customerRouter.post('/', requireWriter, async (req, res, next) => {
  try {
    const body = parseBody(customerSchema, req.body);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({ data: { companyId: req.user!.cid, ...customerData(body) } });
      await writeAudit(tx, { companyId: req.user!.cid, userId: req.user!.uid, action: 'CREATE', entity: 'customer', entityId: created.id, note: created.name });
      return created;
    });
    res.status(201).json(present(row));
  } catch (error) {
    next(error);
  }
});

customerRouter.put('/:id', requireWriter, async (req, res, next) => {
  try {
    const id = numberId(req.params.id);
    const body = parseBody(customerSchema, req.body);
    const existing = await prisma.customer.findFirst({ where: { id, companyId: req.user!.cid } });
    if (!existing) throw httpError(404, 'Customer not found');
    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.customer.update({ where: { id }, data: customerData(body) });
      await writeAudit(tx, { companyId: req.user!.cid, userId: req.user!.uid, action: 'UPDATE', entity: 'customer', entityId: id, note: saved.name });
      return saved;
    });
    res.json(present(row));
  } catch (error) {
    next(error);
  }
});

function numberId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid id');
  return id;
}

function customerData(body: {
  name: string;
  address: string;
  city: string;
  pincode: string;
  gstin?: string | null;
  stateName: string;
  stateCode: string;
  mobile?: string | null;
  email?: string | null;
  openingBalance?: string | number;
  creditLimit?: string | number;
  paymentTerms?: string | null;
  active?: boolean;
}) {
  return {
    name: body.name,
    address: body.address,
    city: body.city,
    pincode: body.pincode,
    gstin: body.gstin || null,
    stateName: body.stateName,
    stateCode: body.stateCode,
    mobile: body.mobile || null,
    email: body.email || null,
    openingBalance: new Prisma.Decimal(String(body.openingBalance ?? '0')),
    creditLimit: new Prisma.Decimal(String(body.creditLimit ?? '0')),
    paymentTerms: body.paymentTerms || null,
    active: body.active ?? true,
  };
}

function present(row: { openingBalance: Prisma.Decimal; creditLimit: Prisma.Decimal }) {
  return {
    ...row,
    openingBalance: row.openingBalance.toFixed(2),
    creditLimit: row.creditLimit.toFixed(2),
  };
}
