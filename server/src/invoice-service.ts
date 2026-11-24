import { Prisma } from '@prisma/client';
import type Decimal from 'decimal.js';
import { writeAudit } from './audit';
import { httpError } from './errors';
import { requestHash } from './gst/crypto';
import { buildEwayPayload, buildNicInvoice, cleanVehicle, validateEinvoice, validateEway, type PortalParty } from './gst/payload';
import { credentialsReady, productionEnabled, submitToPortal, type PortalCredentials } from './gst/portal';
import { financialYear, priceInvoice, type BardanaMode, type PricedInvoice, type ShortageMode, type WeightUnit } from './invoice-calc';
import { prisma } from './prisma';

const QTY = (value: Decimal) => new Prisma.Decimal(value.toFixed(3));
const MONEY = (value: Decimal) => new Prisma.Decimal(value.toFixed(2));

export type InvoiceLineInput = {
  productId?: number | null;
  description: string;
  hsnCode: string;
  bags?: string | number;
  quantity: string | number;
  quantityUnit: WeightUnit;
  rate: string | number;
  rateUnit: WeightUnit;
  discount?: string | number;
  shortageQty?: string | number;
  bardanaAmount?: string | number;
};

export type InvoiceInput = {
  number?: string | null;
  invoiceDate: string;
  customerId: number;
  placeOfSupply: string;
  lines: InvoiceLineInput[];
  transporterName?: string | null;
  transporterGstId?: string | null;
  vehicleNo?: string | null;
  transportMode?: 'ROAD' | 'RAIL' | 'AIR' | 'SHIP';
  distanceKm?: number | null;
  lrNumber?: string | null;
};

export async function previewInvoice(companyId: number, input: InvoiceInput) {
  const { priced, customer, company } = await calculate(companyId, input);
  return presentPriced(priced, customer.stateCode, company.integrationMode);
}

export async function createInvoice(companyId: number, userId: number, input: InvoiceInput) {
  const draft = await calculate(companyId, input);
  const saved = await prisma.$transaction(async (tx) => {
    const number = await resolveNumber(tx, companyId, input, draft.financialYear);
    const row = await tx.salesInvoice.create({
      data: invoiceData(companyId, number, input, draft),
      include: includeInvoice,
    });
    await tx.salesInvoiceItem.createMany({ data: draft.priced.lines.map((line, index) => itemData(row.id, input.lines[index], line)) });
    await writeAudit(tx, { companyId, userId, action: 'CREATE', entity: 'sales_invoice', entityId: row.id, note: number });
    return tx.salesInvoice.findUniqueOrThrow({ where: { id: row.id }, include: includeInvoice });
  });
  return presentInvoice(saved);
}

export async function updateInvoice(companyId: number, userId: number, id: number, input: InvoiceInput) {
  const existing = await ownInvoice(companyId, id);
  if (existing.status !== 'DRAFT') throw httpError(409, 'A final invoice cannot be edited');
  const draft = await calculate(companyId, input);
  const saved = await prisma.$transaction(async (tx) => {
    const number = input.number?.trim() || existing.number;
    if (!/^[A-Za-z0-9][A-Za-z0-9/-]{0,15}$/.test(number)) throw httpError(400, 'Invoice number must be 1 to 16 letters, digits, / or -');
    const clash = await tx.salesInvoice.findFirst({ where: { companyId, financialYear: draft.financialYear, number, NOT: { id } } });
    if (clash) throw httpError(409, 'That invoice number is already used in this financial year');
    await tx.salesInvoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.salesInvoice.update({ where: { id }, data: invoiceData(companyId, number, input, draft) });
    await tx.salesInvoiceItem.createMany({ data: draft.priced.lines.map((line, index) => itemData(id, input.lines[index], line)) });
    await writeAudit(tx, { companyId, userId, action: 'UPDATE', entity: 'sales_invoice', entityId: id, note: number });
    return tx.salesInvoice.findUniqueOrThrow({ where: { id }, include: includeInvoice });
  });
  return presentInvoice(saved);
}

export async function finaliseInvoice(companyId: number, userId: number, id: number) {
  const existing = await ownInvoice(companyId, id);
  if (existing.status === 'FINAL') return presentInvoice(existing);
  if (existing.status === 'CANCELLED') throw httpError(409, 'A cancelled invoice cannot be finalised');
  const saved = await prisma.$transaction(async (tx) => {
    await tx.salesInvoice.update({ where: { id }, data: { status: 'FINAL' } });
    await writeAudit(tx, { companyId, userId, action: 'FINALISE', entity: 'sales_invoice', entityId: id, note: existing.number });
    return tx.salesInvoice.findUniqueOrThrow({ where: { id }, include: includeInvoice });
  });
  return presentInvoice(saved);
}

export async function listInvoices(companyId: number, search: string) {
  const rows = await prisma.salesInvoice.findMany({
    where: {
      companyId,
      ...(search ? { OR: [{ number: { contains: search, mode: 'insensitive' } }, { buyerName: { contains: search, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { id: 'desc' },
    take: 50,
    include: includeInvoice,
  });
  return rows.map(presentInvoice);
}

export async function getInvoice(companyId: number, id: number) {
  return presentInvoice(await ownInvoice(companyId, id));
}

export async function generateEinvoice(companyId: number, userId: number, id: number, retry: boolean) {
  const invoice = await ownInvoice(companyId, id);
  if (invoice.status !== 'FINAL') throw httpError(400, 'Finalise the invoice before requesting an IRN');
  const latest = invoice.einvoices[0];
  const mode = integrationMode(invoice.company.integrationMode);
  if (latest?.irn || invoice.einvoiceState === 'GENERATED') return presentRecord(latest!, 'einvoice');
  if (invoice.einvoiceState === 'PENDING') throw httpError(409, 'An e-invoice request is already running');
  if (invoice.einvoiceState === 'MOCK' && mode === 'MOCK' && latest) return presentRecord(latest, 'einvoice');
  if ((invoice.einvoiceState === 'NOT_APPLICABLE' || invoice.einvoiceState === 'FAILED' || invoice.einvoiceState === 'NOT_SENT') && !retry && latest) {
    return presentRecord(latest, 'einvoice');
  }
  const claimed = await prisma.salesInvoice.updateMany({
    where: { id, OR: [{ einvoiceState: null }, { einvoiceState: 'FAILED' }, { einvoiceState: 'NOT_SENT' }, { einvoiceState: 'MOCK' }, { einvoiceState: 'NOT_APPLICABLE' }, { einvoiceState: 'CANCELLED' }] },
    data: { einvoiceState: 'PENDING' },
  });
  if (!claimed.count) throw httpError(409, 'An e-invoice request is already running');
  try {
    const view = rebuild(invoice);
    const errors = validateEinvoice(view.seller, view.buyer, view.priced, view.doc);
    if (errors.length) return saveEinvoice(invoice, userId, mode, 'NOT_APPLICABLE', errors.join(' '), null, null);
    const payload = buildNicInvoice(view.seller, view.buyer, view.priced, view.doc);
    if (mode === 'MOCK') {
      return saveEinvoice(invoice, userId, mode, 'MOCK', 'MOCK / TEST ONLY. No IRN or government QR was created.', payload, null);
    }
    if (mode === 'PRODUCTION' && !productionEnabled()) {
      return saveEinvoice(invoice, userId, mode, 'FAILED', 'Production GST calls are disabled. No request was sent.', payload, null);
    }
    const credentials = irpCredentials(invoice.company);
    if (!credentialsReady(credentials)) {
      return saveEinvoice(invoice, userId, mode, 'NOT_SENT', 'Sandbox e-invoice credentials are incomplete. No IRN was requested.', payload, null);
    }
    const outcome = await submitToPortal({ kind: 'irp', mode, path: '/eicore/v1.03/Invoice', credentials, payload });
    return saveEinvoice(invoice, userId, mode, outcome.status, outcome.message, payload, outcome);
  } catch (error) {
    await prisma.salesInvoice.update({ where: { id }, data: { einvoiceState: 'FAILED' } });
    throw error;
  }
}

export async function cancelEinvoice(companyId: number, userId: number, id: number, reason: string, remark: string) {
  const invoice = await ownInvoice(companyId, id);
  const latest = invoice.einvoices[0];
  if (!latest) throw httpError(400, 'There is no e-invoice request to cancel');
  if (latest.irn) {
    assertWithin24Hours(latest.ackDate);
    const mode = integrationMode(invoice.company.integrationMode);
    if (mode === 'MOCK') throw httpError(409, 'This IRN was not created by the mock adapter');
    const credentials = irpCredentials(invoice.company);
    if (!credentialsReady(credentials)) throw httpError(400, 'Sandbox credentials are incomplete. The IRN was not cancelled.');
    const outcome = await submitToPortal({
      kind: 'irp',
      mode,
      path: '/eicore/v1.03/Invoice/Cancel',
      credentials,
      payload: { Irn: latest.irn, CnlRsn: reason, CnlRem: remark },
    });
    if (outcome.status === 'FAILED') throw httpError(502, outcome.message);
  }
  const saved = await prisma.einvoiceRecord.update({
    where: { id: latest.id },
    data: {
      status: 'CANCELLED',
      portalMessage: latest.irn ? 'Cancelled on the GST portal' : 'MOCK / TEST ONLY. The portal was not contacted.',
    },
  });
  await prisma.salesInvoice.update({ where: { id }, data: { einvoiceState: 'CANCELLED' } });
  await prisma.auditLog.create({ data: { companyId, userId, action: 'CANCEL_IRN', entity: 'sales_invoice', entityId: id, note: invoice.number } });
  return presentRecord(saved, 'einvoice');
}

export async function generateEway(companyId: number, userId: number, id: number, retry: boolean) {
  const invoice = await ownInvoice(companyId, id);
  if (invoice.status !== 'FINAL') throw httpError(400, 'Finalise the invoice before requesting an e-way bill');
  const latest = invoice.ewayBills[0];
  const mode = integrationMode(invoice.company.integrationMode);
  if (latest?.ewayNo || invoice.ewayState === 'GENERATED') return presentRecord(latest!, 'eway');
  if (invoice.ewayState === 'PENDING') throw httpError(409, 'An e-way request is already running');
  if (invoice.ewayState === 'MOCK' && mode === 'MOCK' && latest) return presentRecord(latest, 'eway');
  if ((invoice.ewayState === 'NOT_APPLICABLE' || invoice.ewayState === 'FAILED' || invoice.ewayState === 'NOT_SENT') && !retry && latest) {
    return presentRecord(latest, 'eway');
  }
  const claimed = await prisma.salesInvoice.updateMany({
    where: { id, OR: [{ ewayState: null }, { ewayState: 'FAILED' }, { ewayState: 'NOT_SENT' }, { ewayState: 'MOCK' }, { ewayState: 'NOT_APPLICABLE' }, { ewayState: 'CANCELLED' }] },
    data: { ewayState: 'PENDING' },
  });
  if (!claimed.count) throw httpError(409, 'An e-way request is already running');
  try {
    const view = rebuild(invoice);
    const errors = validateEway(view.seller, view.buyer, view.priced, view.doc);
    if (errors.length) return saveEway(invoice, userId, mode, 'NOT_APPLICABLE', errors.join(' '), null, null);
    const payload = buildEwayPayload(view.seller, view.buyer, view.priced, view.doc);
    if (mode === 'MOCK') {
      return saveEway(invoice, userId, mode, 'MOCK', 'MOCK / TEST ONLY. No e-way bill number was created.', payload, null);
    }
    if (mode === 'PRODUCTION' && !productionEnabled()) {
      return saveEway(invoice, userId, mode, 'FAILED', 'Production GST calls are disabled. No request was sent.', payload, null);
    }
    const credentials = ewbCredentials(invoice.company);
    if (!credentialsReady(credentials)) {
      return saveEway(invoice, userId, mode, 'NOT_SENT', 'Sandbox e-way credentials are incomplete. No e-way number was requested.', payload, null);
    }
    const outcome = await submitToPortal({ kind: 'eway', mode, path: '/ewayapi', action: 'GENEWAYBILL', credentials, payload });
    return saveEway(invoice, userId, mode, outcome.ewayNo ? 'GENERATED' : outcome.status, outcome.message, payload, outcome);
  } catch (error) {
    await prisma.salesInvoice.update({ where: { id }, data: { ewayState: 'FAILED' } });
    throw error;
  }
}

export async function cancelEway(companyId: number, userId: number, id: number, reason: string, remark: string) {
  const invoice = await ownInvoice(companyId, id);
  const latest = invoice.ewayBills[0];
  if (!latest) throw httpError(400, 'There is no e-way request to cancel');
  if (latest.ewayNo) {
    const mode = integrationMode(invoice.company.integrationMode);
    const credentials = ewbCredentials(invoice.company);
    if (!credentialsReady(credentials) || mode === 'MOCK') throw httpError(400, 'The e-way bill was not cancelled because the portal was not called.');
    const outcome = await submitToPortal({
      kind: 'eway',
      mode,
      path: '/ewayapi',
      action: 'CANEWB',
      credentials,
      payload: { ewbNo: latest.ewayNo, cancelRsnCode: reason, cancelRmrk: remark },
    });
    if (outcome.status === 'FAILED') throw httpError(502, outcome.message);
  }
  const saved = await prisma.ewayBillRecord.update({
    where: { id: latest.id },
    data: { status: 'CANCELLED', portalMessage: latest.ewayNo ? 'Cancelled on the e-way portal' : 'MOCK / TEST ONLY. The portal was not contacted.' },
  });
  await prisma.salesInvoice.update({ where: { id }, data: { ewayState: 'CANCELLED' } });
  await prisma.auditLog.create({ data: { companyId, userId, action: 'CANCEL_EWAY', entity: 'sales_invoice', entityId: id, note: invoice.number } });
  return presentRecord(saved, 'eway');
}

export async function updateEwayVehicle(companyId: number, userId: number, id: number, vehicleNo: string, reason: string, remark: string) {
  const invoice = await ownInvoice(companyId, id);
  const latest = invoice.ewayBills[0];
  const vehicle = cleanVehicle(vehicleNo);
  if (!/^[A-Z0-9]{7,15}$/.test(vehicle)) throw httpError(400, 'Vehicle number must be 7 to 15 letters or digits');
  if (!latest?.ewayNo) throw httpError(409, 'There is no e-way bill number to update');
  const mode = integrationMode(invoice.company.integrationMode);
  const credentials = ewbCredentials(invoice.company);
  if (mode === 'MOCK' || !credentialsReady(credentials)) throw httpError(400, 'Vehicle was not updated because there is no portal e-way bill.');
  const outcome = await submitToPortal({
    kind: 'eway',
    mode,
    path: '/ewayapi',
    action: 'VEHEWB',
    credentials,
    payload: { ewbNo: latest.ewayNo, vehicleNo: vehicle, fromPlace: invoice.company.city, fromState: Number(invoice.company.stateCode), reasonCode: reason, reasonRem: remark, transMode: '1' },
  });
  if (outcome.status === 'FAILED') throw httpError(502, outcome.message);
  const saved = await prisma.ewayBillRecord.update({ where: { id: latest.id }, data: { vehicleNo: vehicle, portalMessage: 'Vehicle updated on the e-way portal' } });
  await prisma.salesInvoice.update({ where: { id }, data: { vehicleNo: vehicle } });
  await prisma.auditLog.create({ data: { companyId, userId, action: 'UPDATE_VEHICLE', entity: 'sales_invoice', entityId: id, note: vehicle } });
  return presentRecord(saved, 'eway');
}

const includeInvoice = {
  items: { orderBy: { id: 'asc' as const } },
  einvoices: { orderBy: { id: 'desc' as const } },
  ewayBills: { orderBy: { id: 'desc' as const } },
  company: true,
  customer: true,
};

async function ownInvoice(companyId: number, id: number) {
  const row = await prisma.salesInvoice.findFirst({ where: { id, companyId }, include: includeInvoice });
  if (!row) throw httpError(404, 'Invoice not found');
  return row;
}

async function calculate(companyId: number, input: InvoiceInput) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw httpError(404, 'Company not found');
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, companyId } });
  if (!customer) throw httpError(400, 'Choose a customer');
  if (input.placeOfSupply !== customer.stateCode) throw httpError(400, 'Place of supply must match the customer state code');
  if (customer.gstin && !customer.gstin.startsWith(customer.stateCode)) throw httpError(400, 'Customer GSTIN does not match the state code');
  const codes = [...new Set(input.lines.map((line) => line.hsnCode))];
  const hsnRows = await prisma.hsnCode.findMany({ where: { companyId, code: { in: codes } } });
  const rates = new Map(hsnRows.map((row) => [row.code, row.gstRate.toString()]));
  for (const line of input.lines) {
    if (!rates.has(line.hsnCode)) throw httpError(400, `HSN ${line.hsnCode} is not in the HSN master`);
  }
  let priced: PricedInvoice;
  try {
    priced = priceInvoice(input.lines.map((line) => ({ ...line, gstRate: rates.get(line.hsnCode) ?? '0' })), {
      shortageMode: asShortage(company.shortageMode),
      bardanaMode: asBardana(company.bardanaMode),
      bardanaRate: company.bardanaRate.toString(),
    }, company.stateCode === input.placeOfSupply);
  } catch (error) {
    throw httpError(400, error instanceof Error ? error.message : 'The invoice could not be priced');
  }
  return { company, customer, priced, financialYear: financialYear(input.invoiceDate) };
}

async function resolveNumber(tx: Prisma.TransactionClient, companyId: number, input: InvoiceInput, year: string) {
  const requested = input.number?.trim();
  if (requested) {
    if (!/^[A-Za-z0-9][A-Za-z0-9/-]{0,15}$/.test(requested)) throw httpError(400, 'Invoice number must be 1 to 16 letters, digits, / or -');
    const clash = await tx.salesInvoice.findFirst({ where: { companyId, financialYear: year, number: requested } });
    if (clash) throw httpError(409, 'That invoice number is already used in this financial year');
    return requested;
  }
  const rows = await tx.salesInvoice.findMany({ where: { companyId, financialYear: year }, select: { number: true } });
  const max = rows.reduce((highest, row) => {
    const match = row.number.match(/(\d+)$/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return `${year}/${String(max + 1).padStart(4, '0')}`;
}

function invoiceData(companyId: number, number: string, input: InvoiceInput, draft: Awaited<ReturnType<typeof calculate>>) {
  return {
    companyId,
    customerId: draft.customer.id,
    number,
    financialYear: draft.financialYear,
    invoiceDate: new Date(`${input.invoiceDate}T00:00:00.000Z`),
    placeOfSupply: input.placeOfSupply,
    buyerName: draft.customer.name,
    buyerGstin: draft.customer.gstin,
    buyerAddress: draft.customer.address,
    buyerCity: draft.customer.city,
    buyerPincode: draft.customer.pincode,
    buyerStateCode: draft.customer.stateCode,
    sellerStateCode: draft.company.stateCode,
    shortageMode: draft.company.shortageMode,
    bardanaMode: draft.company.bardanaMode,
    bardanaRate: draft.company.bardanaRate,
    transporterName: input.transporterName || null,
    transporterGstId: input.transporterGstId || null,
    vehicleNo: input.vehicleNo ? cleanVehicle(input.vehicleNo) : null,
    transportMode: input.transportMode ?? 'ROAD',
    distanceKm: input.distanceKm ?? null,
    lrNumber: input.lrNumber || null,
    taxable: MONEY(draft.priced.taxable),
    cgst: MONEY(draft.priced.cgst),
    sgst: MONEY(draft.priced.sgst),
    igst: MONEY(draft.priced.igst),
    roundOff: MONEY(draft.priced.roundOff),
    total: MONEY(draft.priced.total),
  };
}

function itemData(invoiceId: number, input: InvoiceLineInput, line: PricedInvoice['lines'][number]) {
  return {
    invoiceId,
    productId: input.productId || null,
    description: line.description,
    hsnCode: line.hsnCode,
    bags: MONEY(line.bags),
    quantity: QTY(line.quantity),
    quantityUnit: line.quantityUnit,
    billedQty: QTY(line.billedQty),
    rateUnit: line.rateUnit,
    shortageQty: QTY(line.shortageQty),
    shortageAmount: MONEY(line.shortageAmount),
    bardana: MONEY(line.bardana),
    unit: line.rateUnit,
    rate: MONEY(line.rate),
    discount: MONEY(line.discount),
    taxable: MONEY(line.taxable),
    gstRate: MONEY(line.gstRate),
    cgst: MONEY(line.cgst),
    sgst: MONEY(line.sgst),
    igst: MONEY(line.igst),
    lineTotal: MONEY(line.lineTotal),
  };
}

async function saveEinvoice(invoice: Awaited<ReturnType<typeof ownInvoice>>, userId: number, mode: string, status: string, message: string, payload: unknown, outcome: Awaited<ReturnType<typeof submitToPortal>> | null) {
  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.einvoiceRecord.create({
      data: {
        invoiceId: invoice.id,
        status,
        mode,
        irn: outcome?.irn ?? null,
        ackNo: outcome?.ackNo ?? null,
        ackDate: outcome?.ackDate ?? null,
        signedQr: outcome?.signedQr ?? null,
        signedInvoice: outcome?.signedInvoice ?? null,
        portalMessage: message,
        requestJson: payload == null ? undefined : payload as Prisma.InputJsonValue,
        responseJson: outcome?.response == null ? undefined : outcome.response as Prisma.InputJsonValue,
        irnInvented: false,
        requestHash: payload == null ? null : requestHash(payload),
      },
    });
    await tx.salesInvoice.update({ where: { id: invoice.id }, data: { einvoiceState: status } });
    await tx.apiTransactionLog.create({
      data: { companyId: invoice.companyId, kind: 'EINVOICE', success: status === 'GENERATED' || status === 'MOCK', message },
    });
    await writeAudit(tx, { companyId: invoice.companyId, userId, action: 'EINVOICE', entity: 'sales_invoice', entityId: invoice.id, note: `${status} ${invoice.number}` });
    return row;
  });
  return presentRecord(saved, 'einvoice');
}

async function saveEway(invoice: Awaited<ReturnType<typeof ownInvoice>>, userId: number, mode: string, status: string, message: string, payload: unknown, outcome: Awaited<ReturnType<typeof submitToPortal>> | null) {
  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.ewayBillRecord.create({
      data: {
        invoiceId: invoice.id,
        status,
        mode,
        ewayNo: outcome?.ewayNo ?? null,
        generatedAt: outcome?.generatedAt ?? null,
        validUpto: outcome?.validUpto ?? null,
        vehicleNo: invoice.vehicleNo,
        distanceKm: invoice.distanceKm,
        transporterName: invoice.transporterName,
        transportMode: invoice.transportMode,
        lrNumber: invoice.lrNumber,
        portalMessage: message,
        requestJson: payload == null ? undefined : payload as Prisma.InputJsonValue,
        responseJson: outcome?.response == null ? undefined : outcome.response as Prisma.InputJsonValue,
        invented: false,
      },
    });
    await tx.salesInvoice.update({ where: { id: invoice.id }, data: { ewayState: status } });
    await tx.apiTransactionLog.create({
      data: { companyId: invoice.companyId, kind: 'EWAY', success: status === 'GENERATED' || status === 'MOCK', message },
    });
    await writeAudit(tx, { companyId: invoice.companyId, userId, action: 'EWAY', entity: 'sales_invoice', entityId: invoice.id, note: `${status} ${invoice.number}` });
    return row;
  });
  return presentRecord(saved, 'eway');
}

function rebuild(invoice: Awaited<ReturnType<typeof ownInvoice>>) {
  const seller: PortalParty = {
    gstin: invoice.company.gstin,
    legalName: invoice.company.legalName,
    tradeName: invoice.company.tradeName,
    address: invoice.company.address,
    location: invoice.company.city,
    pincode: invoice.company.pincode,
    stateCode: invoice.company.stateCode,
    phone: invoice.company.phone,
  };
  const buyer: PortalParty = {
    gstin: invoice.buyerGstin ?? '',
    legalName: invoice.buyerName,
    address: invoice.buyerAddress,
    location: invoice.buyerCity,
    pincode: invoice.buyerPincode,
    stateCode: invoice.buyerStateCode,
  };
  const priced = priceInvoice(invoice.items.map((item) => ({
    description: item.description,
    hsnCode: item.hsnCode,
    bags: item.bags.toString(),
    quantity: item.quantity.toString(),
    quantityUnit: item.quantityUnit as WeightUnit,
    rate: item.rate.toString(),
    rateUnit: item.rateUnit as WeightUnit,
    discount: item.discount.toString(),
    shortageQty: item.shortageQty.toString(),
    bardanaAmount: item.bardana.toString(),
    gstRate: item.gstRate.toString(),
  })), {
    shortageMode: asShortage(invoice.shortageMode),
    bardanaMode: asBardana(invoice.bardanaMode),
    bardanaRate: invoice.bardanaRate.toString(),
  }, invoice.sellerStateCode === invoice.placeOfSupply);
  return {
    seller,
    buyer,
    priced,
    doc: {
      number: invoice.number,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      placeOfSupply: invoice.placeOfSupply,
      vehicleNo: invoice.vehicleNo,
      distanceKm: invoice.distanceKm,
      lrNumber: invoice.lrNumber,
      transportMode: invoice.transportMode,
      transporterGstId: invoice.transporterGstId,
      transporterName: invoice.transporterName,
    },
  };
}

function presentPriced(priced: PricedInvoice, buyerStateCode: string, integrationModeValue: string) {
  return {
    ...moneyFields(priced),
    intraState: priced.intraState,
    words: priced.words,
    buyerStateCode,
    integrationMode: integrationModeValue,
    lines: priced.lines.map((line) => ({
      ...line,
      bags: line.bags.toFixed(2),
      quantity: line.quantity.toFixed(3),
      billedQty: line.billedQty.toFixed(3),
      rateQty: line.rateQty.toFixed(3),
      rate: line.rate.toFixed(2),
      discount: line.discount.toFixed(2),
      shortageQty: line.shortageQty.toFixed(3),
      shortageAmount: line.shortageAmount.toFixed(2),
      bardana: line.bardana.toFixed(2),
      gross: line.gross.toFixed(2),
      taxable: line.taxable.toFixed(2),
      gstRate: line.gstRate.toFixed(2),
      cgst: line.cgst.toFixed(2),
      sgst: line.sgst.toFixed(2),
      igst: line.igst.toFixed(2),
      lineTotal: line.lineTotal.toFixed(2),
    })),
  };
}

function moneyFields(priced: PricedInvoice) {
  return {
    taxable: priced.taxable.toFixed(2),
    cgst: priced.cgst.toFixed(2),
    sgst: priced.sgst.toFixed(2),
    igst: priced.igst.toFixed(2),
    roundOff: priced.roundOff.toFixed(2),
    total: priced.total.toFixed(2),
  };
}

function presentInvoice(invoice: Awaited<ReturnType<typeof ownInvoice>>) {
  const priced = rebuild(invoice).priced;
  return {
    id: invoice.id,
    number: invoice.number,
    financialYear: invoice.financialYear,
    invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
    status: invoice.status,
    customerId: invoice.customerId,
    placeOfSupply: invoice.placeOfSupply,
    buyerName: invoice.buyerName,
    buyerGstin: invoice.buyerGstin,
    buyerAddress: invoice.buyerAddress,
    buyerCity: invoice.buyerCity,
    buyerPincode: invoice.buyerPincode,
    buyerStateCode: invoice.buyerStateCode,
    sellerStateCode: invoice.sellerStateCode,
    shortageMode: invoice.shortageMode,
    bardanaMode: invoice.bardanaMode,
    bardanaRate: invoice.bardanaRate.toFixed(2),
    transporterName: invoice.transporterName,
    transporterGstId: invoice.transporterGstId,
    vehicleNo: invoice.vehicleNo,
    transportMode: invoice.transportMode,
    distanceKm: invoice.distanceKm,
    lrNumber: invoice.lrNumber,
    einvoiceState: invoice.einvoiceState,
    ewayState: invoice.ewayState,
    integrationMode: invoice.company.integrationMode,
    words: priced.words,
    ...moneyFields(priced),
    items: invoice.items.map((item) => ({
      ...item,
      bags: item.bags.toFixed(2),
      quantity: item.quantity.toFixed(3),
      billedQty: item.billedQty.toFixed(3),
      shortageQty: item.shortageQty.toFixed(3),
      shortageAmount: item.shortageAmount.toFixed(2),
      bardana: item.bardana.toFixed(2),
      rate: item.rate.toFixed(2),
      discount: item.discount.toFixed(2),
      taxable: item.taxable.toFixed(2),
      gstRate: item.gstRate.toFixed(2),
      cgst: item.cgst.toFixed(2),
      sgst: item.sgst.toFixed(2),
      igst: item.igst.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
    })),
    einvoice: invoice.einvoices[0] ? presentRecord(invoice.einvoices[0], 'einvoice') : null,
    eway: invoice.ewayBills[0] ? presentRecord(invoice.ewayBills[0], 'eway') : null,
  };
}

function presentRecord(record: { irn?: string | null; signedQr?: string | null; signedInvoice?: string | null; ewayNo?: string | null; requestJson?: unknown; responseJson?: unknown; irnInvented?: boolean; invented?: boolean; [key: string]: unknown }, kind: 'einvoice' | 'eway') {
  const { requestJson, responseJson, irnInvented, invented, signedInvoice, ...rest } = record;
  return {
    ...rest,
    irnInvented: false,
    invented: false,
    mock: rest['status'] === 'MOCK',
    signedInvoiceStored: Boolean(signedInvoice),
    governmentQr: kind === 'einvoice' ? Boolean(rest['irn'] && rest['signedQr']) : false,
  };
}

function irpCredentials(company: Awaited<ReturnType<typeof ownInvoice>>['company']): Partial<PortalCredentials> {
  return {
    gstin: company.gstin,
    clientId: company.irpClientId ?? '',
    clientSecret: company.irpClientSecret ?? '',
    username: company.irpUsername ?? '',
    password: company.irpPassword ?? '',
    publicKey: company.irpPublicKey ?? '',
  };
}

function ewbCredentials(company: Awaited<ReturnType<typeof ownInvoice>>['company']): Partial<PortalCredentials> {
  return {
    gstin: company.gstin,
    clientId: company.ewbClientId ?? '',
    clientSecret: company.ewbClientSecret ?? '',
    username: company.ewbUsername ?? '',
    password: company.ewbPassword ?? '',
    publicKey: company.ewbPublicKey ?? '',
  };
}

function integrationMode(value: string): 'MOCK' | 'SANDBOX' | 'PRODUCTION' {
  if (value === 'SANDBOX' || value === 'PRODUCTION') return value;
  return 'MOCK';
}

function asShortage(value: string): ShortageMode {
  if (value === 'NONE' || value === 'QUANTITY' || value === 'AMOUNT') return value;
  return 'QUANTITY';
}

function asBardana(value: string): BardanaMode {
  if (value === 'PER_BAG' || value === 'FLAT' || value === 'NONE') return value;
  return 'NONE';
}

function assertWithin24Hours(ackDate: string | null) {
  if (!ackDate) throw httpError(400, 'The acknowledgement date is missing, so the IRN cannot be cancelled');
  const parsed = ackDate.includes('/')
    ? new Date(ackDate.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1T00:00:00'))
    : new Date(ackDate.replace(' ', 'T'));
  if (!Number.isFinite(parsed.getTime())) throw httpError(400, 'The acknowledgement date could not be read');
  if (Date.now() - parsed.getTime() > 24 * 60 * 60 * 1000) throw httpError(400, 'An IRN can be cancelled only within 24 hours of the acknowledgement');
}
