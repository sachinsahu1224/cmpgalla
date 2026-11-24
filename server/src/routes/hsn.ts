import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireWriter } from '../auth';
import { writeAudit } from '../audit';
import { httpError } from '../errors';
import { prisma } from '../prisma';
import { hsnSchema, parseBody } from '../validate';

export const hsnRouter = Router();

hsnRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await prisma.hsnCode.findMany({ where: { companyId: req.user!.cid }, orderBy: { code: 'asc' } });
    res.json(rows.map(present));
  } catch (error) {
    next(error);
  }
});

hsnRouter.post('/', requireAuth, requireWriter, async (req, res, next) => {
  try {
    const body = parseBody(hsnSchema, req.body);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.hsnCode.create({
        data: { companyId: req.user!.cid, code: body.code, description: body.description, gstRate: new Prisma.Decimal(body.gstRate) },
      });
      await writeAudit(tx, { companyId: req.user!.cid, userId: req.user!.uid, action: 'CREATE', entity: 'hsn', entityId: created.id, note: created.code });
      return created;
    });
    res.status(201).json(present(row));
  } catch (error) {
    next(duplicate(error));
  }
});

hsnRouter.put('/:id', requireAuth, requireWriter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid id');
    const body = parseBody(hsnSchema, req.body);
    const existing = await prisma.hsnCode.findFirst({ where: { id, companyId: req.user!.cid } });
    if (!existing) throw httpError(404, 'HSN code not found');
    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.hsnCode.update({ where: { id }, data: { code: body.code, description: body.description, gstRate: new Prisma.Decimal(body.gstRate) } });
      await writeAudit(tx, { companyId: req.user!.cid, userId: req.user!.uid, action: 'UPDATE', entity: 'hsn', entityId: id, note: saved.code });
      return saved;
    });
    res.json(present(row));
  } catch (error) {
    next(duplicate(error));
  }
});

function present(row: { gstRate: Prisma.Decimal }) {
  return { ...row, gstRate: row.gstRate.toFixed(2) };
}

function duplicate(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return httpError(409, 'That HSN code is already in the master');
  }
  return error;
}
