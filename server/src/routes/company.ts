import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireWriter } from '../auth';
import { writeAudit } from '../audit';
import { httpError } from '../errors';
import { prisma } from '../prisma';
import { companySchema, parseBody } from '../validate';

const secretFields = ['irpClientSecret', 'irpPassword', 'irpPublicKey', 'ewbClientSecret', 'ewbPassword', 'ewbPublicKey'] as const;

export const companyRouter = Router();
companyRouter.use(requireAuth);

companyRouter.get('/', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user!.cid } });
    if (!company) throw httpError(404, 'Company not found');
    res.json(publicCompany(company));
  } catch (error) {
    next(error);
  }
});

companyRouter.put('/', requireWriter, async (req, res, next) => {
  try {
    const body = parseBody(companySchema, req.body);
    if (body.integrationMode === 'PRODUCTION' && process.env.GST_PRODUCTION_ENABLED !== 'true') {
      throw httpError(400, 'Production GST calls are disabled. Use MOCK or SANDBOX.');
    }
    const current = await prisma.company.findUnique({ where: { id: req.user!.cid } });
    if (!current) throw httpError(404, 'Company not found');
    const data: Prisma.CompanyUpdateInput = {
      legalName: body.legalName,
      tradeName: body.tradeName,
      gstin: body.gstin,
      pan: empty(body.pan),
      address: body.address,
      city: body.city,
      pincode: body.pincode,
      stateName: body.stateName,
      stateCode: body.stateCode,
      phone: empty(body.phone),
      email: empty(body.email),
      bankName: empty(body.bankName),
      accountNo: empty(body.accountNo),
      ifsc: empty(body.ifsc),
      branch: empty(body.branch),
      gstEnv: body.gstEnv,
      integrationMode: body.integrationMode,
      shortageMode: body.shortageMode,
      bardanaMode: body.bardanaMode,
      bardanaRate: new Prisma.Decimal(String(body.bardanaRate ?? '0')),
      irpClientId: keep(body.irpClientId, current.irpClientId),
      irpUsername: keep(body.irpUsername, current.irpUsername),
      ewbClientId: keep(body.ewbClientId, current.ewbClientId),
      ewbUsername: keep(body.ewbUsername, current.ewbUsername),
    };
    for (const field of secretFields) {
      const incoming = body[field];
      if (incoming) data[field] = incoming;
    }
    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.company.update({ where: { id: current.id }, data });
      await writeAudit(tx, { companyId: current.id, userId: req.user!.uid, action: 'UPDATE', entity: 'company', entityId: current.id, note: row.tradeName });
      return row;
    });
    res.json(publicCompany(saved));
  } catch (error) {
    next(error);
  }
});

function empty(value: string | null | undefined) {
  return value ? value : null;
}

function keep(value: string | null | undefined, current: string | null) {
  return value ? value : current;
}

function publicCompany(company: {
  irpClientSecret: string | null;
  irpPassword: string | null;
  irpPublicKey: string | null;
  ewbClientSecret: string | null;
  ewbPassword: string | null;
  ewbPublicKey: string | null;
  [key: string]: unknown;
}) {
  const { irpClientSecret, irpPassword, irpPublicKey, ewbClientSecret, ewbPassword, ewbPublicKey, ...rest } = company;
  const rate = rest['bardanaRate'];
  if (rate && typeof rate === 'object' && 'toFixed' in rate) {
    rest['bardanaRate'] = (rate as { toFixed: (digits: number) => string }).toFixed(2);
  }
  return {
    ...rest,
    irpClientSecretSet: Boolean(irpClientSecret),
    irpPasswordSet: Boolean(irpPassword),
    irpPublicKeySet: Boolean(irpPublicKey),
    ewbClientSecretSet: Boolean(ewbClientSecret),
    ewbPasswordSet: Boolean(ewbPassword),
    ewbPublicKeySet: Boolean(ewbPublicKey),
  };
}
