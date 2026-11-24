import { financialYear, inWords, round2, round3, toNicDate } from './money.js';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DOC_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{0,15}$/;

export const STATES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

export function cleanGstin(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '');
}

export function cleanVehicle(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function stateFromGstin(gstin) {
  return cleanGstin(gstin).slice(0, 2);
}

function clip(value, max) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > max ? text.slice(0, max) : text;
}

export function priceBill({ lines, cashDiscount = 0, otherCharges = 0, sellerState, buyerState }) {
  const prepared = (lines || []).map((line) => {
    const qty = round3(line.qty);
    const rate = round2(line.rate);
    const gross = round2(qty * rate);
    const ownDiscount = round2(line.discount || 0);
    return {
      ...line,
      qty,
      rate,
      gross,
      ownDiscount,
      base: round2(Math.max(0, gross - ownDiscount)),
    };
  }).filter((line) => line.description || line.qty || line.rate);

  const baseSum = round2(prepared.reduce((sum, line) => sum + line.base, 0));
  let discountLeft = round2(Math.min(Math.max(0, Number(cashDiscount) || 0), baseSum));
  const intra = String(sellerState || '') === String(buyerState || '') && Boolean(sellerState);

  const priced = prepared.map((line, index) => {
    let cut = 0;
    if (discountLeft && baseSum) {
      if (index === prepared.length - 1) cut = discountLeft;
      else cut = round2((Number(cashDiscount) || 0) * line.base / baseSum);
      if (cut > line.base) cut = line.base;
      if (cut > discountLeft) cut = discountLeft;
      discountLeft = round2(discountLeft - cut);
    }
    const taxable = round2(line.base - cut);
    const gstRate = round2(line.gst_rate || 0);
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (intra) {
      cgst = round2(taxable * gstRate / 200);
      sgst = round2(taxable * gstRate / 200);
    } else {
      igst = round2(taxable * gstRate / 100);
    }
    const lineTotal = round2(taxable + cgst + sgst + igst);
    return {
      ...line,
      discount: round2(line.ownDiscount + cut),
      taxable,
      gst_rate: gstRate,
      cgst,
      sgst,
      igst,
      line_total: lineTotal,
    };
  });

  const taxable = round2(priced.reduce((sum, line) => sum + line.taxable, 0));
  const cgst = round2(priced.reduce((sum, line) => sum + line.cgst, 0));
  const sgst = round2(priced.reduce((sum, line) => sum + line.sgst, 0));
  const igst = round2(priced.reduce((sum, line) => sum + line.igst, 0));
  const charges = round2(otherCharges || 0);
  const raw = round2(taxable + cgst + sgst + igst + charges);
  const total = round2(Math.round(raw));
  const roundOff = round2(total - raw);
  return {
    lines: priced,
    taxable,
    cgst,
    sgst,
    igst,
    other_charges: charges,
    round_off: roundOff,
    total,
    intra,
    words: inWords(total),
  };
}

export function validateDraft(company, party, body) {
  const errors = [];
  if (!String(body.number || '').trim()) errors.push('Bill number bharein.');
  else if (!DOC_RE.test(String(body.number).trim())) errors.push('Bill number 16 character se chhota rakhein. Sirf letter, number, / aur - chalegi.');
  if (!body.doc_date) errors.push('Bill date bharein.');
  if (!party) errors.push('Buyer choose karein.');
  if (!body.lines?.length) errors.push('Kam se kam ek maal ki line honi chahiye.');
  for (const line of body.lines || []) {
    if (!String(line.description || '').trim()) errors.push('Maal ka naam khali hai.');
    if (!(Number(line.qty) > 0)) errors.push(`${line.description || 'Line'} ki quantity bharein.`);
    if (Number(line.rate) < 0) errors.push('Rate minus nahi ho sakta.');
  }
  return errors;
}

export function portalReadiness(company, party, priced, body) {
  const vehicle = cleanVehicle(body.vehicle_no);
  const sellerOk = company.legal_name && GSTIN_RE.test(cleanGstin(company.gstin)) && company.address && /^\d{6}$/.test(company.pincode || '') && company.state_code;
  const buyerGstin = cleanGstin(party?.gstin);
  const buyerOk = party && party.name && party.address && /^\d{6}$/.test(party.pincode || '') && party.state_code;
  const taxable = priced.lines.some((line) => Number(line.gst_rate) > 0);
  const credentials = company.irp_client_id && company.irp_client_secret && company.irp_username && company.irp_password && company.irp_public_key;
  const ewbCredentials = company.ewb_client_id && company.ewb_client_secret && company.ewb_username && company.ewb_password && company.ewb_public_key;

  let einvoiceReason = '';
  if (!credentials) einvoiceReason = 'Settings mein e-Invoice API ka client id, secret, username, password aur public key bharein.';
  else if (!sellerOk) einvoiceReason = 'Firm ka GSTIN, address, 6 digit pincode aur state code Settings mein poora bharein.';
  else if (!buyerOk) einvoiceReason = 'Buyer ka address, 6 digit pincode aur state code party master mein bharein.';
  else if (!GSTIN_RE.test(buyerGstin)) einvoiceReason = 'e-Invoice ke liye buyer ka valid GSTIN chahiye.';
  else if (!taxable) einvoiceReason = 'GST 0 hai. Exempt maal par e-invoice nahi banta. e-Way Bill alag se banao.';
  else if (priced.lines.some((line) => !/^\d{4}(\d{2})?(\d{2})?$/.test(String(line.hsn || '')))) einvoiceReason = 'Har line ka HSN 4, 6 ya 8 digit ka hona chahiye.';

  let ewayReason = '';
  if (!vehicle) ewayReason = 'Vehicle number bharein.';
  else if (!/^[A-Z0-9]{7,15}$/.test(vehicle)) ewayReason = 'Vehicle number 7 se 15 letters/numbers ka hona chahiye, bina space.';
  else if (!sellerOk || !buyerOk) ewayReason = 'Seller aur buyer ka address aur pincode poora hona chahiye.';
  else if (!buyerGstin && !party?.name) ewayReason = 'Buyer ka naam chahiye.';

  const ewayNeedsOwnApi = !taxable || !GSTIN_RE.test(buyerGstin);
  if (!ewayReason && ewayNeedsOwnApi && !ewbCredentials) {
    ewayReason = 'Bina IRN wale e-way ke liye Settings mein alag e-Way Bill API details bharein.';
  }

  return {
    einvoice: { ok: !einvoiceReason, reason: einvoiceReason },
    eway: { ok: !ewayReason, reason: ewayReason, via: ewayNeedsOwnApi ? 'eway-portal' : 'irp' },
    vehicle,
  };
}

export function buildNicInvoice(company, party, body, priced) {
  const sellerState = company.state_code;
  const buyerState = party.state_code || stateFromGstin(party.gstin);
  const pos = buyerState;
  const payload = {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: 'B2B',
      RegRev: 'N',
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ: 'INV',
      No: String(body.number).trim(),
      Dt: toNicDate(body.doc_date),
    },
    SellerDtls: {
      Gstin: cleanGstin(company.gstin),
      LglNm: clip(company.legal_name, 100),
      TrdNm: clip(company.trade_name || company.legal_name, 100),
      Addr1: clip(company.address, 100),
      Loc: clip(company.location, 50),
      Pin: Number(company.pincode),
      Stcd: sellerState,
      Ph: String(company.phone || '').replace(/\D/g, '').slice(0, 12) || undefined,
    },
    BuyerDtls: {
      Gstin: cleanGstin(party.gstin),
      LglNm: clip(party.name, 100),
      Pos: pos,
      Addr1: clip(party.address, 100),
      Loc: clip(party.location, 50),
      Pin: Number(party.pincode),
      Stcd: buyerState,
    },
    ItemList: priced.lines.map((line, index) => ({
      SlNo: String(index + 1),
      PrdDesc: clip(line.description, 300),
      IsServc: 'N',
      HsnCd: String(line.hsn),
      Qty: line.qty,
      Unit: line.unit || 'QTL',
      UnitPrice: line.rate,
      TotAmt: line.gross,
      Discount: line.discount,
      AssAmt: line.taxable,
      GstRt: line.gst_rate,
      IgstAmt: line.igst,
      CgstAmt: line.cgst,
      SgstAmt: line.sgst,
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: line.line_total,
    })),
    ValDtls: {
      AssVal: priced.taxable,
      CgstVal: priced.cgst,
      SgstVal: priced.sgst,
      IgstVal: priced.igst,
      CesVal: 0,
      StCesVal: 0,
      Discount: 0,
      OthChrg: priced.other_charges,
      RndOffAmt: priced.round_off,
      TotInvVal: priced.total,
    },
  };

  const vehicle = cleanVehicle(body.vehicle_no);
  if (vehicle) {
    payload.EwbDtls = {
      TransMode: '1',
      Distance: body.distance === '' || body.distance == null ? 0 : Number(body.distance),
      VehNo: vehicle,
      VehType: 'R',
    };
    if (body.bilti_no) {
      payload.EwbDtls.TransDocNo = clip(body.bilti_no, 16);
      payload.EwbDtls.TransDocDt = toNicDate(body.bilti_date || body.doc_date);
    }
  }

  for (const block of [payload.SellerDtls, payload.BuyerDtls]) {
    for (const key of Object.keys(block)) {
      if (block[key] === undefined || block[key] === '') delete block[key];
    }
  }
  return payload;
}

export function buildEwayPayload(company, party, body, priced) {
  const buyerGstin = cleanGstin(party.gstin);
  const sellerState = Number(company.state_code);
  const buyerState = Number(party.state_code || stateFromGstin(party.gstin));
  return {
    supplyType: 'O',
    subSupplyType: '1',
    docType: 'INV',
    docNo: String(body.number).trim(),
    docDate: toNicDate(body.doc_date),
    fromGstin: cleanGstin(company.gstin),
    fromTrdName: clip(company.trade_name || company.legal_name, 100),
    fromAddr1: clip(company.address, 120),
    fromPlace: clip(company.location, 50),
    fromPincode: Number(company.pincode),
    fromStateCode: sellerState,
    actFromStateCode: sellerState,
    toGstin: GSTIN_RE.test(buyerGstin) ? buyerGstin : 'URP',
    toTrdName: clip(party.name, 100),
    toAddr1: clip(party.address, 120),
    toPlace: clip(party.location, 50),
    toPincode: Number(party.pincode),
    toStateCode: buyerState,
    actToStateCode: buyerState,
    transactionType: 1,
    totalValue: priced.taxable,
    cgstValue: priced.cgst,
    sgstValue: priced.sgst,
    igstValue: priced.igst,
    cessValue: 0,
    cessNonAdvolValue: 0,
    otherValue: round2(priced.other_charges + priced.round_off),
    totInvValue: priced.total,
    transMode: '1',
    transDistance: String(body.distance === '' || body.distance == null ? 0 : body.distance),
    transDocNo: body.bilti_no ? clip(body.bilti_no, 16) : undefined,
    transDocDate: body.bilti_no ? toNicDate(body.bilti_date || body.doc_date) : undefined,
    vehicleNo: cleanVehicle(body.vehicle_no),
    vehicleType: 'R',
    itemList: priced.lines.map((line) => ({
      productName: clip(line.description, 100),
      productDesc: clip(line.description, 100),
      hsnCode: Number(line.hsn),
      quantity: line.qty,
      qtyUnit: line.unit || 'QTL',
      taxableAmount: line.taxable,
      cgstRate: priced.intra ? round2(line.gst_rate / 2) : 0,
      sgstRate: priced.intra ? round2(line.gst_rate / 2) : 0,
      igstRate: priced.intra ? 0 : line.gst_rate,
      cessRate: 0,
    })),
  };
}

export function stripEmpty(value) {
  if (Array.isArray(value)) return value.map(stripEmpty);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    out[key] = stripEmpty(item);
  }
  return out;
}

export function sameFinancialYear(left, right) {
  return financialYear(left) === financialYear(right);
}

export { financialYear };
