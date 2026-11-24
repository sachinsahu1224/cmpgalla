import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import QRCode from 'qrcode'
import { amountInWords, formatAmount, gstPaise, inWords, toPaise } from './money'
import { buyerById, partyOf, priceInvoice, type Buyer, type Invoice, type Settings } from './model'

const W = 595.28
const H = 841.89
const L = 28
const R = W - 28
const INK = rgb(0, 0, 0)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type PortalDummy = { irn: string; ack: string; ewb: string; ackDate: string; generated: string; validUpto: string }

export async function downloadGovtPdf(invoice: Invoice, settings: Settings, customers: Buyer[]) {
  const fontBytes = await fetch('/fonts/NotoSansDevanagari-Regular.ttf').then((response) => {
    if (!response.ok) throw new Error('Invoice font is missing.')
    return response.arrayBuffer()
  })
  const bytes = await buildGovtPdf(invoice, settings, customers, fontBytes)
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `invoice-${invoice.number || 'draft'}-dummy.pdf`
  link.click()
  URL.revokeObjectURL(url)
}

export async function buildGovtPdf(invoice: Invoice, settings: Settings, customers: Buyer[], fontBytes: ArrayBuffer) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fontBytes, { subset: true })
  const seller = { ...partyOf(settings), ...(invoice.seller ?? {}) }
  const buyer = buyerById(customers, invoice.buyerId)
  const priced = priceInvoice(invoice, seller.stateCode)
  const totalPaise = priced.totalPaise
  const roundOffPaise = priced.roundOffPaise
  const dummy = dummyPortal(invoice)
  const qr = await doc.embedPng(await qrPng(`${dummy.irn}|${dummy.ack}|${dummy.ewb}|${invoice.number}|${invoice.date}`))
  drawTaxInvoice(doc.addPage([W, H]), font, { invoice, seller, buyer, priced, totalPaise, roundOffPaise, dummy, qr })
  drawEway(doc.addPage([W, H]), font, { invoice, seller, buyer, priced, totalPaise, roundOffPaise, dummy, qr })
  return doc.save()
}

function drawTaxInvoice(page: PDFPage, font: PDFFont, data: DrawData) {
  const { invoice, seller, buyer, priced, totalPaise, roundOffPaise, dummy, qr } = data
  let y = H - 22
  text(page, font, 'DUMMY DATA', L, y, 8)
  text(page, font, 'Tax Invoice', W / 2 - 28, y, 11)
  text(page, font, 'e-Invoice', R - 78, y, 9)
  page.drawImage(qr, { x: R - 72, y: y - 78, width: 72, height: 72 })
  y -= 18
  for (const line of [
    `IRN        :  ${splitIrn(dummy.irn)[0]}`,
    `              ${splitIrn(dummy.irn)[1]}`,
    `Ack No.    :  ${dummy.ack}`,
    `Ack Date   :  ${dummy.ackDate}`,
  ]) {
    text(page, font, line, L, y, 8)
    y -= 11
  }
  y -= 8
  const boxTop = y
  const leftW = 250
  const mid = L + leftW
  let ly = boxTop - 14
  ly = block(page, font, [
    seller.tradeName,
    seller.address,
    `${seller.city}, ${seller.stateName} ${seller.pincode}`,
    `GSTIN: ${seller.gstin}`,
    `PAN: ${seller.pan || '—'}`,
    `CONT- ${seller.phone || '—'}`,
    `GSTIN/UIN: ${seller.gstin}`,
    `State Name : ${seller.stateName}, Code : ${seller.stateCode}`,
    '',
    'Buyer (Bill to)',
    buyer?.name || '—',
    buyer ? `${buyer.address}, ${buyer.city}, ${buyer.stateName}, ${buyer.pincode}` : '',
    `GSTIN/UIN  :  ${buyer?.gstin || '—'}`,
    `State Name  :  ${buyer ? `${buyer.stateName}, Code : ${buyer.stateCode}` : '—'}`,
    `Place of Supply  :  ${buyer?.stateName || '—'}`,
  ], L + 6, ly, leftW - 12, 8)
  const rowH = 28
  const rightW = R - mid
  const third = rightW / 3
  const firstRow: [string, string][] = [
    ['Invoice No.', invoice.number || 'Draft'],
    ['e-Way Bill No.', dummy.ewb],
    ['Dated', govtDate(invoice.date)],
  ]
  firstRow.forEach((pair, index) => {
    const width = index === 2 ? rightW - third * 2 : third
    cell(page, font, pair[0], pair[1], mid + index * third, boxTop - rowH, width, rowH)
  })
  const meta: [string, string][] = [
    ['Mode/Terms of Payment', ''],
    ['Reference No. & Date.', invoice.tokenNo || ''],
    ['Other References', ''],
    ['Vessel/Flight No.', invoice.vehicleNo || ''],
    ['Place of receipt by shipper:', ''],
    ['City/Port of Loading', seller.city],
    ['City/Port of Discharge', buyer?.city || ''],
    ['Bill of Lading/LR-RR No.', ''],
    ['Terms of Delivery', ''],
  ]
  let my = boxTop - rowH
  const cellW = rightW / 2
  for (let i = 0; i < meta.length; i += 2) {
    cell(page, font, meta[i][0], meta[i][1], mid, my - rowH, cellW, rowH)
    if (meta[i + 1]) cell(page, font, meta[i + 1][0], meta[i + 1][1], mid + cellW, my - rowH, rightW - cellW, rowH)
    my -= rowH
  }
  const boxBottom = Math.min(ly - 8, my)
  page.drawRectangle({ x: L, y: boxBottom, width: R - L, height: boxTop - boxBottom, borderWidth: 0.8, borderColor: INK })
  page.drawLine({ start: { x: mid, y: boxTop }, end: { x: mid, y: boxBottom }, thickness: 0.6, color: INK })

  y = boxBottom
  const cols = columns()
  y = tableHeader(page, font, y, cols)
  priced.lines.forEach((line, index) => {
    y = tableRow(page, font, y, cols, [
      String(index + 1),
      line.description,
      line.hsn,
      `${line.quantity} ${line.quantityUnit === 'QTL' ? 'Quntl' : 'Kg'}`,
      formatAmount(toPaise(line.rate)),
      line.rateUnit === 'QTL' ? 'Quntl' : 'Kg',
      formatAmount(line.taxablePaise),
    ])
  })
  const bags = Number(invoice.bardanaBags || '0')
  if (bags > 0) {
    y = tableRow(page, font, y, cols, [String(priced.lines.length + 1), 'Bora Bardaan', '', `${bags.toFixed(2)} Nag`, '', 'Nag', ''])
  }
  y = moneyRow(page, font, y, cols, 'CGST TAX', formatAmount(priced.cgstPaise))
  y = moneyRow(page, font, y, cols, 'SGST TAX', formatAmount(priced.sgstPaise))
  if (priced.igstPaise) y = moneyRow(page, font, y, cols, 'IGST TAX', formatAmount(priced.igstPaise))
  y = moneyRow(page, font, y, cols, roundOffPaise < 0 ? 'Less : Round Off' : 'Round Off', roundOffPaise < 0 ? `(-)${formatAmount(Math.abs(roundOffPaise))}` : formatAmount(roundOffPaise))
  y = moneyRow(page, font, y, cols, 'Total', `Rs. ${formatAmount(totalPaise)}`, true)
  text(page, font, 'Amount Chargeable (in words)', L + 4, y - 12, 7)
  text(page, font, 'E. & O.E', R - 48, y - 12, 7)
  text(page, font, inWords(Math.round(totalPaise / 100)), L + 4, y - 24, 8)
  y -= 30
  y = taxTable(page, font, y, data)
  const taxPaise = priced.cgstPaise + priced.sgstPaise + priced.igstPaise
  text(page, font, `Tax Amount (in words) :  ${amountInWords(taxPaise)}`, L + 4, y - 12, 7)
  y -= 18
  const footTop = y
  const footH = 92
  page.drawRectangle({ x: L, y: footTop - footH, width: R - L, height: footH, borderWidth: 0.8, borderColor: INK })
  page.drawLine({ start: { x: mid, y: footTop }, end: { x: mid, y: footTop - footH }, thickness: 0.6, color: INK })
  block(page, font, [
    'Declaration',
    'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  ], L + 6, footTop - 12, leftW - 12, 7)
  text(page, font, "Customer's Seal and Signature", L + 6, footTop - footH + 10, 7)
  block(page, font, [
    "Company's Bank Details",
    `Bank Name : ${seller.bankName || '—'}`,
    `A/c No. : ${seller.accountNo || '—'}`,
    `Branch & IFS Code: ${seller.branch || '—'} & ${seller.ifsc || '—'}`,
    `for ${seller.tradeName}`,
  ], mid + 6, footTop - 12, R - mid - 12, 7)
  text(page, font, 'Authorised Signatory', R - 110, footTop - footH + 10, 7)
  text(page, font, 'This is a Computer Generated Invoice', W / 2 - 78, footTop - footH - 14, 8)
}

function drawEway(page: PDFPage, font: PDFFont, data: DrawData) {
  const { invoice, seller, buyer, priced, totalPaise, roundOffPaise, dummy, qr } = data
  let y = H - 22
  text(page, font, 'DUMMY DATA', L, y, 8)
  text(page, font, 'e-Way Bill', W / 2 - 32, y, 12)
  text(page, font, 'e-Way Bill', R - 78, y, 9)
  page.drawImage(qr, { x: R - 72, y: y - 78, width: 72, height: 72 })
  y -= 18
  for (const line of [
    `Doc No.   :  Tax Invoice - ${invoice.number || 'Draft'}`,
    `Date      :  ${govtDate(invoice.date)}`,
    `IRN       :  ${dummy.irn}`,
    `Ack No.   :  ${dummy.ack}`,
    `Ack Date  :  ${dummy.ackDate}`,
  ]) {
    const shown = line.length > 78 ? `${line.slice(0, 78)}` : line
    text(page, font, shown, L, y, 8)
    y -= 12
  }
  y -= 16
  text(page, font, '1. e-Way Bill Details', L, y, 9)
  y -= 16
  const details = [
    ['e-Way Bill No.', dummy.ewb],
    ['Mode', modeLabel(invoice.transportMode)],
    ['Generated Date', dummy.generated],
    ['Generated By', seller.gstin],
    ['Approx Distance', `${invoice.distanceKm || '0'} KM`],
    ['Valid Upto', dummy.validUpto],
    ['Supply Type', 'Outward-Supply'],
    ['Transaction Type', 'Regular'],
  ]
  details.forEach((pair, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    text(page, font, `${pair[0]} :  ${pair[1]}`, L + col * 270, y - row * 14, 8)
  })
  y -= 70
  text(page, font, '2. Address Details', L, y, 9)
  y -= 14
  const addresses = [
    ['From', `${seller.tradeName}, GSTIN : ${seller.gstin}, ${seller.stateName}`],
    ['Dispatch From', `${seller.address}, ${seller.city} ${seller.pincode}`],
    ['To', `${buyer?.name || '—'}, GSTIN : ${buyer?.gstin || '—'}`],
    ['Ship To', buyer ? `${buyer.address}, ${buyer.city} ${buyer.pincode}` : '—'],
  ]
  addresses.forEach((pair, index) => {
    const x = L + (index % 2) * 270
    const rowY = y - Math.floor(index / 2) * 28
    text(page, font, pair[0], x, rowY, 8)
    text(page, font, clip(font, pair[1], 8, 250), x, rowY - 11, 7)
  })
  y -= 68
  text(page, font, '3. Goods Details', L, y, 9)
  y -= 6
  const cols = [70, 180, 80, 100, R - L - 430]
  const heads = ['HSN Code', 'Product Name & Desc', 'Quantity', 'Taxable Amt', 'Tax Rate (C+S)']
  let x = L
  heads.forEach((head, index) => {
    text(page, font, head, x + 2, y - 12, 7)
    x += cols[index]
  })
  page.drawLine({ start: { x: L, y: y - 16 }, end: { x: R, y: y - 16 }, thickness: 0.6, color: INK })
  y -= 30
  priced.lines.forEach((line) => {
    const rate = priced.intra ? `${(line.gstRate / 2).toFixed(2)}+${(line.gstRate / 2).toFixed(2)}` : line.gstRate.toFixed(2)
    const values = [line.hsn, line.description, `${line.quantity} ${line.quantityUnit === 'QTL' ? 'QTL' : 'KG'}`, formatAmount(line.taxablePaise), rate]
    let cx = L
    values.forEach((value, index) => {
      text(page, font, clip(font, value, 8, cols[index] - 4), cx + 2, y, 8)
      cx += cols[index]
    })
    y -= 14
  })
  const bags = Number(invoice.bardanaBags || '0')
  if (bags > 0) {
    text(page, font, 'Bora Bardaan', L + 72, y, 8)
    text(page, font, `${bags.toFixed(2)} QTL`, L + 252, y, 8)
    y -= 14
  }
  y -= 6
  text(page, font, `Tot.Taxable Amt :  ${formatAmount(priced.taxablePaise)}`, L, y, 8)
  text(page, font, `Other Amt :  ${roundOffPaise < 0 ? `(-)${formatAmount(Math.abs(roundOffPaise))}` : formatAmount(roundOffPaise)}`, L + 220, y, 8)
  text(page, font, `Total Inv Amt :  Rs. ${formatAmount(totalPaise)}`, L + 380, y, 8)
  y -= 14
  text(page, font, `CGST Amt :  ${formatAmount(priced.cgstPaise)}`, L, y, 8)
  text(page, font, `SGST Amt :  ${formatAmount(priced.sgstPaise)}`, L + 180, y, 8)
  if (priced.igstPaise) text(page, font, `IGST Amt :  ${formatAmount(priced.igstPaise)}`, L + 340, y, 8)
  y -= 22
  text(page, font, '4. Transportation Details', L, y, 9)
  y -= 14
  text(page, font, `Transporter ID :  ${invoice.transporterId || '—'}`, L, y, 8)
  text(page, font, `Doc No. :  —`, L + 270, y, 8)
  y -= 14
  text(page, font, `Name :  ${invoice.transporterName || '—'}`, L, y, 8)
  text(page, font, `Date :  ${govtDate(invoice.date)}`, L + 270, y, 8)
  y -= 22
  text(page, font, '5. Vehicle Details', L, y, 9)
  y -= 14
  text(page, font, `Vehicle No. :  ${invoice.vehicleNo || '—'}`, L, y, 8)
  text(page, font, `From :  ${seller.city || '—'}`, L + 200, y, 8)
  text(page, font, 'CEWB No. :  —', L + 360, y, 8)
}

function taxTable(page: PDFPage, font: PDFFont, y: number, data: DrawData) {
  const { priced } = data
  const groups = new Map<string, { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>()
  for (const line of priced.lines) {
    const key = `${line.hsn}-${line.gstRate}`
    const current = groups.get(key) ?? { hsn: line.hsn, rate: line.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    const tax = gstPaise(line.taxablePaise, line.gstRate, priced.intra)
    current.taxable += line.taxablePaise
    current.cgst += tax.cgst
    current.sgst += tax.sgst
    current.igst += tax.igst
    groups.set(key, current)
  }
  const heads = priced.intra
    ? ['HSN/SAC', 'Taxable Value', 'Central Tax Rate', 'Central Tax Amount', 'State Tax Rate', 'State Tax Amount', 'Total Tax Amount']
    : ['HSN/SAC', 'Taxable Value', 'Integrated Tax Rate', 'Integrated Tax Amount', 'Total Tax Amount']
  const width = (R - L) / heads.length
  page.drawRectangle({ x: L, y: y - 16, width: R - L, height: 16, borderWidth: 0.6, borderColor: INK })
  heads.forEach((head, index) => text(page, font, head, L + index * width + 2, y - 11, 6))
  y -= 16
  for (const group of groups.values()) {
    const total = group.cgst + group.sgst + group.igst
    const values = priced.intra
      ? [group.hsn, formatAmount(group.taxable), `${(group.rate / 2).toFixed(2)}%`, formatAmount(group.cgst), `${(group.rate / 2).toFixed(2)}%`, formatAmount(group.sgst), formatAmount(total)]
      : [group.hsn, formatAmount(group.taxable), `${group.rate.toFixed(2)}%`, formatAmount(group.igst), formatAmount(total)]
    page.drawRectangle({ x: L, y: y - 14, width: R - L, height: 14, borderWidth: 0.4, borderColor: INK })
    values.forEach((value, index) => text(page, font, value, L + index * width + 2, y - 10, 7))
    y -= 14
  }
  return y
}

function columns() {
  const widths = [28, 190, 62, 78, 58, 40]
  const used = widths.reduce((sum, width) => sum + width, 0)
  return [...widths, R - L - used]
}

function tableHeader(page: PDFPage, font: PDFFont, y: number, cols: number[]) {
  const labels = ['Sl No.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount']
  const h = 18
  page.drawRectangle({ x: L, y: y - h, width: R - L, height: h, borderWidth: 0.7, borderColor: INK })
  let x = L
  labels.forEach((label, index) => {
    text(page, font, label, x + 2, y - 12, 7)
    if (index < labels.length - 1) page.drawLine({ start: { x: x + cols[index], y }, end: { x: x + cols[index], y: y - h }, thickness: 0.4, color: INK })
    x += cols[index]
  })
  return y - h
}

function tableRow(page: PDFPage, font: PDFFont, y: number, cols: number[], values: string[]) {
  const h = 14
  page.drawRectangle({ x: L, y: y - h, width: R - L, height: h, borderWidth: 0.4, borderColor: INK })
  let x = L
  values.forEach((value, index) => {
    const size = 7
    const shown = clip(font, value, size, cols[index] - 4)
    const width = font.widthOfTextAtSize(shown, size)
    const alignRight = index >= 3
    text(page, font, shown, alignRight ? x + cols[index] - width - 2 : x + 2, y - 10, size)
    x += cols[index]
  })
  return y - h
}

function moneyRow(page: PDFPage, font: PDFFont, y: number, cols: number[], label: string, amount: string, strong = false) {
  const h = 13
  const amountX = L + cols.slice(0, 6).reduce((sum, width) => sum + width, 0)
  page.drawRectangle({ x: L, y: y - h, width: R - L, height: h, borderWidth: 0.4, borderColor: INK })
  const size = strong ? 8 : 7
  const labelWidth = font.widthOfTextAtSize(label, size)
  text(page, font, label, amountX - labelWidth - 6, y - 10, size)
  const amountWidth = font.widthOfTextAtSize(amount, size)
  text(page, font, amount, R - amountWidth - 4, y - 10, size)
  return y - h
}

function cell(page: PDFPage, font: PDFFont, label: string, value: string, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.4, borderColor: INK })
  text(page, font, label, x + 3, y + h - 10, 6)
  text(page, font, clip(font, value, 8, w - 6), x + 3, y + 6, 8)
}

function block(page: PDFPage, font: PDFFont, lines: string[], x: number, y: number, width: number, size: number) {
  for (const line of lines) {
    const parts = line ? wrap(font, line, size, width) : ['']
    for (const part of parts) {
      if (part) text(page, font, part, x, y, size)
      y -= size + 3
    }
  }
  return y
}

function wrap(font: PDFFont, value: string, size: number, width: number) {
  const words = value.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= width) line = next
    else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function clip(font: PDFFont, value: string, size: number, width: number) {
  if (font.widthOfTextAtSize(value, size) <= width) return value
  let shown = value
  while (shown && font.widthOfTextAtSize(`${shown}...`, size) > width) shown = shown.slice(0, -1)
  return `${shown}...`
}

function text(page: PDFPage, font: PDFFont, value: string, x: number, y: number, size: number) {
  page.drawText(value || ' ', { x, y, size, font, color: INK })
}

function dummyPortal(invoice: Invoice): PortalDummy {
  const token = (invoice.number || '1').replace(/\W/g, '').slice(-6).padStart(6, '0')
  const ackDate = govtDate(invoice.date)
  return {
    irn: (`DUMMY${token}${'0'.repeat(64)}`).slice(0, 64),
    ack: `DUMMY${token}000`,
    ewb: `DUMMY${token}`,
    ackDate,
    generated: `${ackDate} 3:04 PM`,
    validUpto: `${nextDate(invoice.date)} 11:59 PM`,
  }
}

function splitIrn(irn: string) {
  return [irn.slice(0, 48), irn.slice(48)]
}

function govtDate(iso: string) {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  return `${day}-${MONTHS[Number(month) - 1]}-${year.slice(2)}`
}

function nextDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day + 1)
  return `${String(date.getDate()).padStart(2, '0')}-${MONTHS[date.getMonth()]}-${String(date.getFullYear()).slice(2)}`
}

function modeLabel(mode: string) {
  if (mode === 'RAIL') return '2 - Rail'
  if (mode === 'AIR') return '3 - Air'
  if (mode === 'SHIP') return '4 - Ship'
  return '1 - Road'
}

async function qrPng(value: string) {
  const url = await QRCode.toDataURL(value, { margin: 0, width: 256, errorCorrectionLevel: 'M' })
  const binary = atob(url.split(',')[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

type DrawData = {
  invoice: Invoice
  seller: ReturnType<typeof partyOf>
  buyer: ReturnType<typeof buyerById>
  priced: ReturnType<typeof priceInvoice>
  totalPaise: number
  roundOffPaise: number
  dummy: PortalDummy
  qr: Awaited<ReturnType<PDFDocument['embedPng']>>
}
