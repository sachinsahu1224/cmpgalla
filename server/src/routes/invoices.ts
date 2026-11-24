import { Router } from 'express';
import { requireAuth, requireWriter } from '../auth';
import { httpError } from '../errors';
import { createInvoice, finaliseInvoice, generateEinvoice, generateEway, getInvoice, listInvoices, previewInvoice, updateInvoice, cancelEinvoice, cancelEway, updateEwayVehicle } from '../invoice-service';
import { renderInvoicePdf } from '../pdf';
import { prisma } from '../prisma';
import { invoiceSchema, parseBody } from '../validate';
import { z } from 'zod';

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth);

invoiceRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listInvoices(req.user!.cid, String(req.query.search ?? '').trim()));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.post('/preview', async (req, res, next) => {
  try {
    res.json(await previewInvoice(req.user!.cid, parseBody(invoiceSchema, req.body)));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.post('/', requireWriter, async (req, res, next) => {
  try {
    res.status(201).json(await createInvoice(req.user!.cid, req.user!.uid, parseBody(invoiceSchema, req.body)));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await getInvoice(req.user!.cid, routeId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.put('/:id', requireWriter, async (req, res, next) => {
  try {
    res.json(await updateInvoice(req.user!.cid, req.user!.uid, routeId(req.params.id), parseBody(invoiceSchema, req.body)));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.post('/:id/finalise', requireWriter, async (req, res, next) => {
  try {
    res.json(await finaliseInvoice(req.user!.cid, req.user!.uid, routeId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.get('/:id/pdf', async (req, res, next) => {
  try {
    const invoice = await getInvoice(req.user!.cid, routeId(req.params.id));
    const company = await prisma.company.findUnique({ where: { id: req.user!.cid } });
    if (!company) throw httpError(404, 'Company not found');
    const pdf = await renderInvoicePdf({ ...invoice, company });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.number.replace(/[^\w.-]+/g, '-')}.pdf"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

invoiceRouter.post('/:id/einvoice', requireWriter, async (req, res, next) => {
  try {
    const body = parseBody(z.object({ retry: z.boolean().optional() }), req.body ?? {});
    res.json(await generateEinvoice(req.user!.cid, req.user!.uid, routeId(req.params.id), Boolean(body.retry)));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.post('/:id/einvoice/cancel', requireWriter, async (req, res, next) => {
  try {
    const body = parseBody(cancelSchema, req.body);
    res.json(await cancelEinvoice(req.user!.cid, req.user!.uid, routeId(req.params.id), body.reason, body.remark));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.post('/:id/eway', requireWriter, async (req, res, next) => {
  try {
    const body = parseBody(z.object({ retry: z.boolean().optional() }), req.body ?? {});
    res.json(await generateEway(req.user!.cid, req.user!.uid, routeId(req.params.id), Boolean(body.retry)));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.post('/:id/eway/cancel', requireWriter, async (req, res, next) => {
  try {
    const body = parseBody(cancelSchema, req.body);
    res.json(await cancelEway(req.user!.cid, req.user!.uid, routeId(req.params.id), body.reason, body.remark));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.post('/:id/eway/vehicle', requireWriter, async (req, res, next) => {
  try {
    const body = parseBody(z.object({
      vehicleNo: z.string().trim().min(4),
      reason: z.string().trim().min(1),
      remark: z.string().trim().min(1),
    }), req.body);
    res.json(await updateEwayVehicle(req.user!.cid, req.user!.uid, routeId(req.params.id), body.vehicleNo, body.reason, body.remark));
  } catch (error) {
    next(error);
  }
});

const cancelSchema = z.object({
  reason: z.string().trim().regex(/^[1-4]$/, 'Choose a cancellation reason'),
  remark: z.string().trim().min(1, 'Enter a cancellation remark'),
});

function routeId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Invalid id');
  return id;
}
