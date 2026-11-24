import fs from 'node:fs';
import PDFDocument from 'pdfkit';

type PdfLine = {
  description: string;
  hsnCode: string;
  bags: string;
  quantity: string;
  quantityUnit: string;
  billedQty: string;
  rate: string;
  rateUnit: string;
  taxable: string;
  gstRate: string;
  cgst: string;
  sgst: string;
  igst: string;
};

export type PdfInvoice = {
  number: string;
  invoiceDate: string;
  buyerName: string;
  buyerGstin: string | null;
  buyerAddress: string;
  buyerCity: string;
  buyerPincode: string;
  buyerStateCode: string;
  placeOfSupply: string;
  vehicleNo: string | null;
  transporterName: string | null;
  distanceKm: number | null;
  lrNumber: string | null;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  roundOff: string;
  total: string;
  words: string;
  integrationMode: string;
  einvoiceState: string | null;
  ewayState: string | null;
  items: PdfLine[];
  company: {
    legalName: string;
    tradeName: string;
    gstin: string;
    address: string;
    city: string;
    pincode: string;
    stateName: string;
    phone: string | null;
    bankName: string | null;
    accountNo: string | null;
    ifsc: string | null;
    branch: string | null;
  };
};

export function renderInvoicePdf(invoice: PdfInvoice) {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const font = 'C:\\Windows\\Fonts\\Nirmala.ttf';
  if (fs.existsSync(font)) doc.font(font);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  if (invoice.integrationMode === 'MOCK' || invoice.einvoiceState === 'MOCK' || invoice.ewayState === 'MOCK') {
    doc.fontSize(11).fillColor('#9a3412').text('MOCK / TEST ONLY — this copy is not a government e-invoice');
    doc.moveDown(0.4);
  }
  doc.fillColor('#1b4d3e').fontSize(18).text(invoice.company.tradeName, { align: 'center' });
  doc.fillColor('#1c1917').fontSize(9).text(invoice.company.address, { align: 'center' });
  doc.text(`${invoice.company.city} ${invoice.company.pincode}, ${invoice.company.stateName}`, { align: 'center' });
  doc.text(`GSTIN ${invoice.company.gstin}${invoice.company.phone ? `    Phone ${invoice.company.phone}` : ''}`, { align: 'center' });
  doc.moveDown(0.6);
  doc.fontSize(13).text('Tax Invoice', { align: 'center' });
  doc.moveDown(0.4);
  doc.fontSize(10);
  doc.text(`Invoice no. ${invoice.number}     Date ${invoice.invoiceDate}     Place of supply ${invoice.placeOfSupply}`);
  doc.moveDown(0.4);
  doc.text(`Buyer: ${invoice.buyerName}`);
  doc.text(`${invoice.buyerAddress}, ${invoice.buyerCity} ${invoice.buyerPincode}`);
  doc.text(`GSTIN ${invoice.buyerGstin || 'Unregistered'}     State ${invoice.buyerStateCode}`);
  doc.moveDown(0.6);
  doc.fontSize(9);
  doc.text('Item                         HSN         Qty        Rate         Taxable      GST');
  doc.moveDown(0.2);
  for (const item of invoice.items) {
    doc.text(`${item.description}  ${item.hsnCode}  ${item.billedQty} ${item.quantityUnit} @ ${item.rate}/${item.rateUnit}`);
    doc.text(`Bags ${item.bags}    Taxable ${inr(item.taxable)}    GST ${item.gstRate}%    CGST ${inr(item.cgst)}  SGST ${inr(item.sgst)}  IGST ${inr(item.igst)}`);
    doc.moveDown(0.3);
  }
  doc.moveDown(0.3);
  doc.fontSize(10);
  doc.text(`Taxable value ${inr(invoice.taxable)}`);
  doc.text(`CGST ${inr(invoice.cgst)}    SGST ${inr(invoice.sgst)}    IGST ${inr(invoice.igst)}`);
  doc.text(`Round off ${inr(invoice.roundOff)}`);
  doc.fontSize(12).text(`Total ${inr(invoice.total)}`);
  doc.fontSize(9).text(invoice.words);
  doc.moveDown(0.5);
  if (invoice.vehicleNo || invoice.transporterName) {
    doc.text(`Transport: ${invoice.transporterName || '-'}    Vehicle ${invoice.vehicleNo || '-'}    Distance ${invoice.distanceKm ?? 0} km    LR ${invoice.lrNumber || '-'}`);
  }
  if (invoice.company.bankName) {
    doc.moveDown(0.4);
    doc.text(`${invoice.company.bankName}, A/c ${invoice.company.accountNo || '-'}, IFSC ${invoice.company.ifsc || '-'}, ${invoice.company.branch || ''}`);
  }
  doc.moveDown(0.6);
  doc.fillColor('#57534e').text('A government QR code is printed only after the GST portal returns a signed QR. This software does not create one.');
  doc.end();
  return done;
}

function inr(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}
