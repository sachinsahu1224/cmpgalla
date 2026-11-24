import type { ZodType } from 'zod';
import { z } from 'zod';
import { httpError } from './errors';

export const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const optionalText = z.union([z.string(), z.null(), z.undefined()]).transform((value) => (value ?? '').trim());

const optionalEmail = optionalText.refine(
  (value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  'Enter a valid email',
);

const optionalGstin = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (value ?? '').trim().toUpperCase())
  .refine((value) => value === '' || GSTIN.test(value), 'Enter a valid GSTIN');

const optionalPan = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (value ?? '').trim().toUpperCase())
  .refine((value) => value === '' || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value), 'Enter a valid PAN');

const moneyText = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const text = String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter an amount with up to 2 decimal places' });
    return z.NEVER;
  }
  return text;
});

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw httpError(400, result.error.issues[0]?.message ?? 'Invalid input');
  }
  return result.data;
}

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const companySchema = z.object({
  legalName: z.string().trim().min(2, 'Legal name is required'),
  tradeName: z.string().trim().min(2, 'Trade name is required'),
  gstin: z.string().trim().toUpperCase().regex(GSTIN, 'Enter a valid 15-character GSTIN'),
  pan: optionalPan,
  address: z.string().trim().min(5, 'Address is required'),
  city: z.string().trim().min(2, 'City is required'),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'PIN code must be 6 digits'),
  stateName: z.string().trim().min(2, 'State is required'),
  stateCode: z.string().trim().regex(/^[0-9]{2}$/, 'State code must be 2 digits'),
  phone: optionalText,
  email: optionalEmail,
  bankName: optionalText,
  accountNo: optionalText,
  ifsc: optionalText,
  branch: optionalText,
  gstEnv: z.enum(['SANDBOX', 'PRODUCTION']),
  irpClientId: optionalText,
  irpClientSecret: optionalText,
  irpUsername: optionalText,
  irpPassword: optionalText,
  irpPublicKey: optionalText,
  ewbClientId: optionalText,
  ewbClientSecret: optionalText,
  ewbUsername: optionalText,
  ewbPassword: optionalText,
  ewbPublicKey: optionalText,
  integrationMode: z.enum(['MOCK', 'SANDBOX', 'PRODUCTION']).default('MOCK'),
  shortageMode: z.enum(['NONE', 'QUANTITY', 'AMOUNT']).default('QUANTITY'),
  bardanaMode: z.enum(['NONE', 'PER_BAG', 'FLAT']).default('NONE'),
  bardanaRate: moneyText.default('0'),
});

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name is required'),
  address: z.string().trim().min(3, 'Address is required'),
  city: z.string().trim().min(2, 'City is required'),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'PIN code must be 6 digits'),
  gstin: optionalGstin,
  stateName: z.string().trim().min(2, 'State is required'),
  stateCode: z.string().trim().regex(/^[0-9]{2}$/, 'State code must be 2 digits'),
  mobile: optionalText,
  email: optionalEmail,
  openingBalance: moneyText.default('0'),
  creditLimit: moneyText.default('0'),
  paymentTerms: optionalText,
  active: z.boolean().default(true),
});

const qty3 = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,3})?$/.test(text)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a quantity with up to 3 decimal places' });
    return z.NEVER;
  }
  return text;
});

export const hsnSchema = z.object({
  code: z.string().trim().regex(/^\d{4}(\d{2}){0,2}$/, 'HSN must be 4, 6 or 8 digits'),
  description: z.string().trim().min(2, 'Description is required'),
  gstRate: moneyText,
});

export const invoiceLineSchema = z.object({
  productId: z.number().int().positive().nullish(),
  description: z.string().trim().min(1, 'Item name is required'),
  hsnCode: z.string().trim().regex(/^\d{4}(\d{2}){0,2}$/, 'HSN must be 4, 6 or 8 digits'),
  bags: qty3.default('0'),
  quantity: qty3,
  quantityUnit: z.enum(['KG', 'QTL']),
  rate: moneyText,
  rateUnit: z.enum(['KG', 'QTL']),
  discount: moneyText.default('0'),
  shortageQty: qty3.default('0'),
  bardanaAmount: moneyText.default('0'),
});

export const invoiceSchema = z.object({
  number: optionalText,
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an invoice date'),
  customerId: z.number().int().positive('Choose a customer'),
  placeOfSupply: z.string().trim().regex(/^[0-9]{2}$/, 'Place of supply must be a 2 digit state code'),
  lines: z.array(invoiceLineSchema).min(1, 'Add at least one item').max(100),
  transporterName: optionalText,
  transporterGstId: optionalText,
  vehicleNo: optionalText,
  transportMode: z.enum(['ROAD', 'RAIL', 'AIR', 'SHIP']).default('ROAD'),
  distanceKm: z.number().int().min(0).max(4000).nullish(),
  lrNumber: optionalText,
});

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required'),
  unit: z.enum(['QTL', 'BAG', 'KGS', 'MTS', 'NOS']),
  hsnId: z.number().int().positive('Select an HSN code'),
  active: z.boolean().default(true),
});
