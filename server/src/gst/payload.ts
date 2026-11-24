import type { PricedInvoice, PricedLine } from '../invoice-calc';

export type PortalParty = {
  gstin: string;
  legalName: string;
  tradeName?: string | null;
  address: string;
  location: string;
  pincode: string;
  stateCode: string;
  phone?: string | null;
};

export type PortalInvoice = {
  number: string;
  invoiceDate: string;
  placeOfSupply: string;
  vehicleNo?: string | null;
  distanceKm?: number | null;
  lrNumber?: string | null;
  transportMode?: string | null;
  transporterGstId?: string | null;
  transporterName?: string | null;
};

const DOC_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{0,15}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function cleanGstin(value: string | null | undefined) {
  return String(value ?? '').toUpperCase().replace(/\s+/g, '');
}

export function cleanVehicle(value: string | null | undefined) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function nicDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function nicUnit(unit: string) {
  return unit === 'KG' ? 'KGS' : unit;
}

function clip(value: string | null | undefined, max: number) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text.length > max ? text.slice(0, max) : text;
}

function num(value: { toFixed: (digits: number) => string }, digits: number) {
  return Number(value.toFixed(digits));
}

export function validateEinvoice(seller: PortalParty, buyer: PortalParty, priced: PricedInvoice, invoice: PortalInvoice) {
  const errors: string[] = [];
  if (!DOC_RE.test(invoice.number.trim())) errors.push('Invoice number must be 1 to 16 letters, digits, / or -');
  if (!GSTIN_RE.test(cleanGstin(seller.gstin))) errors.push('Seller GSTIN is incomplete');
  if (!seller.address || !/^\d{6}$/.test(seller.pincode) || !seller.stateCode) errors.push('Seller address, PIN and state code are required');
  if (!buyer.legalName || !buyer.address || !/^\d{6}$/.test(buyer.pincode) || !buyer.stateCode) errors.push('Buyer address, PIN and state code are required');
  if (!GSTIN_RE.test(cleanGstin(buyer.gstin))) errors.push('e-Invoice needs the buyer GSTIN');
  if (!priced.lines.some((line) => line.gstRate.gt(0))) errors.push('GST is 0. Exempt goods do not get an IRN. Generate the e-way bill separately when the value needs one.');
  if (priced.lines.some((line) => !/^\d{4}(\d{2}){0,2}$/.test(line.hsnCode))) errors.push('Every line needs a 4, 6 or 8 digit HSN code');
  return errors;
}

export function validateEway(seller: PortalParty, buyer: PortalParty, priced: PricedInvoice, invoice: PortalInvoice) {
  const errors: string[] = [];
  if (priced.total.lte(50000)) errors.push('e-Way bill is not required at or below Rs 50,000');
  const vehicle = cleanVehicle(invoice.vehicleNo);
  if (!vehicle) errors.push('Vehicle number is required');
  else if (!/^[A-Z0-9]{7,15}$/.test(vehicle)) errors.push('Vehicle number must be 7 to 15 letters or digits');
  if (!seller.address || !/^\d{6}$/.test(seller.pincode)) errors.push('Seller PIN code is required');
  if (!buyer.legalName || !buyer.address || !/^\d{6}$/.test(buyer.pincode)) errors.push('Buyer address and PIN code are required');
  if (invoice.distanceKm != null && (invoice.distanceKm < 0 || invoice.distanceKm > 4000)) errors.push('Distance must be between 0 and 4000 km');
  return errors;
}

export function buildNicInvoice(seller: PortalParty, buyer: PortalParty, priced: PricedInvoice, invoice: PortalInvoice) {
  const payload: Record<string, unknown> = {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: invoice.number.trim(), Dt: nicDate(invoice.invoiceDate) },
    SellerDtls: partyBlock(seller, false),
    BuyerDtls: { ...partyBlock({ ...buyer, legalName: buyer.legalName }, true), Pos: invoice.placeOfSupply },
    ItemList: priced.lines.map((line, index) => itemBlock(line, index)),
    ValDtls: {
      AssVal: num(priced.taxable, 2),
      CgstVal: num(priced.cgst, 2),
      SgstVal: num(priced.sgst, 2),
      IgstVal: num(priced.igst, 2),
      CesVal: 0,
      StCesVal: 0,
      Discount: 0,
      OthChrg: 0,
      RndOffAmt: num(priced.roundOff, 2),
      TotInvVal: num(priced.total, 2),
    },
  };
  const vehicle = cleanVehicle(invoice.vehicleNo);
  if (vehicle) {
    payload.EwbDtls = {
      TransMode: modeCode(invoice.transportMode),
      Distance: invoice.distanceKm ?? 0,
      VehNo: vehicle,
      VehType: 'R',
      ...(invoice.transporterGstId ? { TransId: cleanGstin(invoice.transporterGstId) } : {}),
      ...(invoice.transporterName ? { TransName: clip(invoice.transporterName, 100) } : {}),
      ...(invoice.lrNumber ? { TransDocNo: clip(invoice.lrNumber, 16), TransDocDt: nicDate(invoice.invoiceDate) } : {}),
    };
  }
  return payload;
}

export function buildEwayPayload(seller: PortalParty, buyer: PortalParty, priced: PricedInvoice, invoice: PortalInvoice) {
  const buyerGstin = cleanGstin(buyer.gstin);
  return {
    supplyType: 'O',
    subSupplyType: '1',
    docType: 'INV',
    docNo: invoice.number.trim(),
    docDate: nicDate(invoice.invoiceDate),
    fromGstin: cleanGstin(seller.gstin),
    fromTrdName: clip(seller.tradeName || seller.legalName, 100),
    fromAddr1: clip(seller.address, 120),
    fromPlace: clip(seller.location, 50),
    fromPincode: Number(seller.pincode),
    fromStateCode: Number(seller.stateCode),
    actFromStateCode: Number(seller.stateCode),
    toGstin: GSTIN_RE.test(buyerGstin) ? buyerGstin : 'URP',
    toTrdName: clip(buyer.legalName, 100),
    toAddr1: clip(buyer.address, 120),
    toPlace: clip(buyer.location, 50),
    toPincode: Number(buyer.pincode),
    toStateCode: Number(buyer.stateCode),
    actToStateCode: Number(buyer.stateCode),
    transactionType: 1,
    totalValue: num(priced.taxable, 2),
    cgstValue: num(priced.cgst, 2),
    sgstValue: num(priced.sgst, 2),
    igstValue: num(priced.igst, 2),
    cessValue: 0,
    cessNonAdvolValue: 0,
    otherValue: num(priced.roundOff, 2),
    totInvValue: num(priced.total, 2),
    transMode: modeCode(invoice.transportMode),
    transDistance: String(invoice.distanceKm ?? 0),
    transporterId: invoice.transporterGstId ? cleanGstin(invoice.transporterGstId) : undefined,
    transporterName: invoice.transporterName ? clip(invoice.transporterName, 100) : undefined,
    transDocNo: invoice.lrNumber ? clip(invoice.lrNumber, 16) : undefined,
    transDocDate: invoice.lrNumber ? nicDate(invoice.invoiceDate) : undefined,
    vehicleNo: cleanVehicle(invoice.vehicleNo),
    vehicleType: 'R',
    itemList: priced.lines.map((line) => ({
      productName: clip(line.description, 100),
      productDesc: clip(line.description, 100),
      hsnCode: Number(line.hsnCode),
      quantity: num(line.rateQty, 3),
      qtyUnit: nicUnit(line.rateUnit),
      taxableAmount: num(line.taxable, 2),
      cgstRate: priced.intraState ? num(line.gstRate.div(2), 2) : 0,
      sgstRate: priced.intraState ? num(line.gstRate.div(2), 2) : 0,
      igstRate: priced.intraState ? 0 : num(line.gstRate, 2),
      cessRate: 0,
    })),
  };
}

function itemBlock(line: PricedLine, index: number) {
  const preTaxCuts = line.discount.plus(line.shortageAmount).plus(line.bardana);
  return {
    SlNo: String(index + 1),
    PrdDesc: clip(line.description, 300),
    IsServc: 'N',
    HsnCd: line.hsnCode,
    Qty: num(line.rateQty, 3),
    Unit: nicUnit(line.rateUnit),
    UnitPrice: num(line.rate, 2),
    TotAmt: num(line.gross, 2),
    Discount: num(preTaxCuts, 2),
    AssAmt: num(line.taxable, 2),
    GstRt: num(line.gstRate, 2),
    IgstAmt: num(line.igst, 2),
    CgstAmt: num(line.cgst, 2),
    SgstAmt: num(line.sgst, 2),
    CesRt: 0,
    CesAmt: 0,
    CesNonAdvlAmt: 0,
    StateCesRt: 0,
    StateCesAmt: 0,
    StateCesNonAdvlAmt: 0,
    OthChrg: 0,
    TotItemVal: num(line.lineTotal, 2),
  };
}

function partyBlock(party: PortalParty, buyer: boolean) {
  return {
    Gstin: cleanGstin(party.gstin),
    [buyer ? 'LglNm' : 'LglNm']: clip(party.legalName, 100),
    ...(buyer ? {} : { TrdNm: clip(party.tradeName || party.legalName, 100) }),
    Addr1: clip(party.address, 100),
    Loc: clip(party.location, 50),
    Pin: Number(party.pincode),
    Stcd: party.stateCode,
  };
}

function modeCode(mode: string | null | undefined) {
  if (mode === 'RAIL') return '2';
  if (mode === 'AIR') return '3';
  if (mode === 'SHIP') return '4';
  return '1';
}
