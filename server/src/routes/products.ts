import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireWriter } from '../auth';
import { writeAudit } from '../audit';
import { httpError } from '../errors';
import { prisma } from '../prisma';
import { parseBody, productSchema } from '../validate';

export const productRouter = Router();
productRouter.use(requireAuth);

productRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const rows = await prisma.product.findMany({
      where: {
        companyId: req.user!.cid,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: { hsn: true },
      orderBy: { name: 'asc' },
    });
    res.json(rows.map(present));
  } catch (error) {
    next(error);
  }
});

productRouter.post('/', requireWriter, async (req, res, next) => {
  try {
    const body = parseBody(productSchema, req.body);
    const hsn = await prisma.hsnCode.findFirst({ where: { id: body.hsnId, companyId: req.user!.cid } });
    if (!hsn) throw httpError(400, 'Select an HSN code from the master');
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { companyId: req.user!.cid, name: body.name, unit: body.unit, hsnId: hsn.id, gstRate: hsn.gstRate, active: body.active },
        include: { hsn: true },
      });
      await writeAudit(tx, { companyId: req.user!.cid, userId: req.user!.uid, action: 'CREATE', entity: 'product', entityId: created.id, note: created.name });
      return created;
    });
    res.status(201).json(present(row));
  } catch (error) {
    next(error);
  }
});

productRouter.put('/:id', requireWriter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid id');
    const body = parseBody(productSchema, req.body);
    const existing = await prisma.product.findFirst({ where: { id, companyId: req.user!.cid } });
    if (!existing) throw httpError(404, 'Product not found');
    const hsn = await prisma.hsnCode.findFirst({ where: { id: body.hsnId, companyId: req.user!.cid } });
    if (!hsn) throw httpError(400, 'Select an HSN code from the master');
    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.product.update({
        where: { id },
        data: { name: body.name, unit: body.unit, hsnId: hsn.id, gstRate: hsn.gstRate, active: body.active },
        include: { hsn: true },
      });
      await writeAudit(tx, { companyId: req.user!.cid, userId: req.user!.uid, action: 'UPDATE', entity: 'product', entityId: id, note: saved.name });
      return saved;
    });
    res.json(present(row));
  } catch (error) {
    next(error);
  }
});

function present(row: { gstRate: Prisma.Decimal; hsn: { gstRate: Prisma.Decimal } | null }) {
  return {
    ...row,
    gstRate: row.gstRate.toFixed(2),
    hsn: row.hsn ? { ...row.hsn, gstRate: row.hsn.gstRate.toFixed(2) } : null,
  };
}
