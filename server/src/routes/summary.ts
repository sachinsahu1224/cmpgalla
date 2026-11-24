import { Router } from 'express';
import { requireAuth } from '../auth';
import { prisma } from '../prisma';

export const summaryRouter = Router();

summaryRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = req.user!.cid;
    const [company, customers, products, hsnCodes, invoices] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.customer.count({ where: { companyId, active: true } }),
      prisma.product.count({ where: { companyId, active: true } }),
      prisma.hsnCode.count({ where: { companyId } }),
      prisma.salesInvoice.count({ where: { companyId } }),
    ]);
    res.json({
      companyName: company?.tradeName ?? '',
      gstin: company?.gstin ?? '',
      gstEnv: company?.gstEnv ?? 'SANDBOX',
      integrationMode: company?.integrationMode ?? 'MOCK',
      customers,
      products,
      hsnCodes,
      invoices,
    });
  } catch (error) {
    next(error);
  }
});
