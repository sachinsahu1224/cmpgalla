import { InvoiceBarcode, invoiceBarcodeText } from './InvoiceBarcode'
import { acceptedIrn, buyerById, partyOf, priceInvoice, type Buyer, type Invoice, type Settings, type Unit } from './model'
import { amountInWords, formatAmount, formatInr, toPaise } from './money'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function InvoiceSheet({ invoice, settings, customers }: { invoice: Invoice; settings: Settings; customers: Buyer[] }) {
  const seller = { ...partyOf(settings), ...(invoice.seller ?? {}) }
  const buyer = buyerById(customers, invoice.buyerId)
  const priced = priceInvoice(invoice, seller.stateCode)
  const irn = acceptedIrn(invoice.einvoice.irn)
  const ewayNo = invoice.eway.ewayNo || ''
  const bags = Number(invoice.bardanaBags || '0')

  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white p-4 text-[13px] text-slate-900 shadow-sm sm:p-6">
      {irn ? null : settings.integrationMode === 'MOCK' ? (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-900">
          MOCK / TEST ONLY — this copy is not a government e-invoice. IRN and e-Way Bill No. stay blank until the portal returns them.
        </p>
      ) : (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-900">
          Sandbox — this copy is not a government e-invoice. IRN and e-Way Bill No. stay blank until the sandbox returns them.
        </p>
      )}
      <div className="border border-slate-800">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-center text-sm font-semibold">Tax Invoice</p>
            <div className="mt-2 text-xs leading-5">
              <p className="break-all"><span className="font-semibold">IRN :</span> {irn || '—'}</p>
              <p><span className="font-semibold">Ack No. :</span> {irn ? invoice.einvoice.ackNo || '—' : '—'}</p>
              <p><span className="font-semibold">Ack Date :</span> {irn ? invoice.einvoice.ackDate || '—' : '—'}</p>
            </div>
          </div>
          <InvoiceBarcode
            label="e-Invoice"
            value={invoiceBarcodeText({
              gstin: seller.gstin,
              number: invoice.number,
              date: invoice.date,
              buyerGstin: buyer?.gstin || '',
              amount: String(priced.totalPaise),
            })}
          />
        </div>
        <div className="grid border-b border-slate-800 sm:grid-cols-2">
          <div className="border-b border-slate-800 p-3 sm:border-b-0 sm:border-r">
            <p className="text-base font-semibold">{seller.tradeName}</p>
            <p>{seller.address}</p>
            <p>{seller.city.trim()}, {seller.stateName} {seller.pincode}</p>
            <p className="mt-1">GSTIN: {seller.gstin}</p>
            <p>PAN: {seller.pan || '—'}</p>
            <p>CONT- {seller.phone || '—'}</p>
            <p>GSTIN/UIN: {seller.gstin}</p>
            <p>State Name : {seller.stateName}, Code : {seller.stateCode}</p>
            <p className="mt-2 font-semibold">Buyer (Bill to)</p>
            <p className="font-medium">{buyer?.name ?? '—'}</p>
            <p>{buyer ? `${buyer.address}, ${buyer.city}, ${buyer.stateName}, ${buyer.pincode}` : ''}</p>
            <p className="mt-1">GSTIN/UIN : {buyer?.gstin || '—'}</p>
            <p>State Name : {buyer ? `${buyer.stateName}, Code : ${buyer.stateCode}` : '—'}</p>
            <p>Place of Supply : {buyer?.stateName || '—'}</p>
          </div>
          <div className="text-xs">
            <div className="grid grid-cols-3">
              <Meta label="Invoice No." value={invoice.number || 'Draft'} />
              <Meta label="e-Way Bill No." value={ewayNo || '—'} />
              <Meta label="Dated" value={govtDate(invoice.date)} />
            </div>
            <div className="grid grid-cols-2">
              <Meta label="Mode/Terms of Payment" value="" />
              <Meta label="Reference No. & Date." value={invoice.tokenNo || ''} />
              <Meta label="Other References" value="" />
              <Meta label="Vessel/Flight No." value={invoice.vehicleNo || ''} />
              <Meta label="Place of receipt by shipper:" value="" />
              <Meta label="City/Port of Loading" value={seller.city} />
              <Meta label="City/Port of Discharge" value={buyer?.city || ''} />
              <Meta label="Bill of Lading/LR-RR No." value="" />
              <Meta label="Terms of Delivery" value="" />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-2 py-1 font-semibold">Sl No.</th>
                <th className="px-2 py-1 font-semibold">Description of Goods</th>
                <th className="px-2 py-1 font-semibold">HSN/SAC</th>
                <th className="px-2 py-1 text-right font-semibold">Quantity</th>
                <th className="px-2 py-1 text-right font-semibold">Rate</th>
                <th className="px-2 py-1 font-semibold">per</th>
                <th className="px-2 py-1 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {priced.lines.map((line, index) => (
                <tr key={line.id} className="border-b border-slate-200">
                  <td className="px-2 py-1">{index + 1}</td>
                  <td className="px-2 py-1">{line.description}</td>
                  <td className="px-2 py-1">{line.hsn}</td>
                  <td className="px-2 py-1 text-right">{line.quantity} {unitName(line.quantityUnit)}</td>
                  <td className="px-2 py-1 text-right">{formatAmount(toPaise(line.rate))}</td>
                  <td className="px-2 py-1">{unitName(line.rateUnit)}</td>
                  <td className="px-2 py-1 text-right">{formatAmount(line.taxablePaise)}</td>
                </tr>
              ))}
              {bags > 0 ? (
                <tr className="border-b border-slate-200">
                  <td className="px-2 py-1">{priced.lines.length + 1}</td>
                  <td className="px-2 py-1">Bora Bardaan</td>
                  <td className="px-2 py-1" />
                  <td className="px-2 py-1 text-right">{Number(bags).toFixed(2)} Nag</td>
                  <td className="px-2 py-1" />
                  <td className="px-2 py-1">Nag</td>
                  <td className="px-2 py-1" />
                </tr>
              ) : null}
              <tr>
                <td className="px-2 py-1" colSpan={6} />
                <td className="px-2 py-1 text-right">{formatAmount(priced.taxablePaise)}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 text-right" colSpan={6}>CGST TAX</td>
                <td className="px-2 py-1 text-right">{formatAmount(priced.cgstPaise)}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 text-right" colSpan={6}>SGST TAX</td>
                <td className="px-2 py-1 text-right">{formatAmount(priced.sgstPaise)}</td>
              </tr>
              {priced.igstPaise ? (
                <tr>
                  <td className="px-2 py-1 text-right" colSpan={6}>IGST TAX</td>
                  <td className="px-2 py-1 text-right">{formatAmount(priced.igstPaise)}</td>
                </tr>
              ) : null}
              <tr>
                <td className="px-2 py-1 text-right" colSpan={6}>{priced.roundOffPaise < 0 ? 'Less : Round Off' : 'Round Off'}</td>
                <td className="px-2 py-1 text-right">{priced.roundOffPaise < 0 ? `(-)${formatAmount(Math.abs(priced.roundOffPaise))}` : formatAmount(priced.roundOffPaise)}</td>
              </tr>
              <tr className="border-t border-slate-800 font-semibold">
                <td className="px-2 py-1" colSpan={6}>Total</td>
                <td className="px-2 py-1 text-right">{formatInr(priced.totalPaise)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="grid border-t border-slate-800 sm:grid-cols-[1fr_auto]">
          <p className="p-2"><span className="font-semibold">Amount Chargeable (in words)</span><br />{priced.words}</p>
          <p className="p-2 text-right text-xs">E. & O.E</p>
        </div>
        <TaxSummary priced={priced} />
        <p className="border-t border-slate-800 p-2 text-xs">
          <span className="font-semibold">Tax Amount (in words) :</span> {amountInWords(priced.cgstPaise + priced.sgstPaise + priced.igstPaise)}
        </p>
        <div className="grid border-t border-slate-800 sm:grid-cols-2">
          <div className="border-b border-slate-800 p-2 text-xs sm:border-b-0 sm:border-r">
            <p className="font-semibold">Declaration</p>
            <p>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>
            <p className="mt-4">Customer's Seal and Signature</p>
          </div>
          <div className="p-2 text-xs">
            <p className="font-semibold">Company's Bank Details</p>
            <p>Bank Name : {seller.bankName || '—'}</p>
            <p>A/c No. : {seller.accountNo || '—'}</p>
            <p>Branch & IFS Code: {seller.branch || '—'} & {seller.ifsc || '—'}</p>
            <p className="mt-6 text-right">for {seller.tradeName}</p>
            <p className="mt-6 text-right">Authorised Signatory</p>
          </div>
        </div>
        <p className="border-t border-slate-800 py-1 text-center text-xs">This is a Computer Generated Invoice</p>
      </div>
    </article>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-slate-300 p-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="min-h-4 font-medium">{value}</p>
    </div>
  )
}

function TaxSummary({ priced }: { priced: ReturnType<typeof priceInvoice> }) {
  const groups = new Map<string, { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>()
  for (const line of priced.lines) {
    const key = `${line.hsn}-${line.gstRate}`
    const current = groups.get(key) ?? { hsn: line.hsn, rate: line.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    current.taxable += line.taxablePaise
    current.cgst += line.cgstPaise
    current.sgst += line.sgstPaise
    current.igst += line.igstPaise
    groups.set(key, current)
  }
  const rows = [...groups.values()]
  return (
    <div className="overflow-x-auto border-t border-slate-800">
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-right">
            <th className="px-2 py-1 text-left font-semibold">HSN/SAC</th>
            <th className="px-2 py-1 font-semibold">Taxable Value</th>
            {priced.intra ? (
              <>
                <th className="px-2 py-1 font-semibold">Central Tax Rate</th>
                <th className="px-2 py-1 font-semibold">Central Tax Amount</th>
                <th className="px-2 py-1 font-semibold">State Tax Rate</th>
                <th className="px-2 py-1 font-semibold">State Tax Amount</th>
              </>
            ) : (
              <>
                <th className="px-2 py-1 font-semibold">Integrated Tax Rate</th>
                <th className="px-2 py-1 font-semibold">Integrated Tax Amount</th>
              </>
            )}
            <th className="px-2 py-1 font-semibold">Total Tax Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((group) => (
            <tr key={`${group.hsn}-${group.rate}`} className="border-b border-slate-200 text-right">
              <td className="px-2 py-1 text-left">{group.hsn}</td>
              <td className="px-2 py-1">{formatAmount(group.taxable)}</td>
              {priced.intra ? (
                <>
                  <td className="px-2 py-1">{(group.rate / 2).toFixed(2)}%</td>
                  <td className="px-2 py-1">{formatAmount(group.cgst)}</td>
                  <td className="px-2 py-1">{(group.rate / 2).toFixed(2)}%</td>
                  <td className="px-2 py-1">{formatAmount(group.sgst)}</td>
                </>
              ) : (
                <>
                  <td className="px-2 py-1">{group.rate.toFixed(2)}%</td>
                  <td className="px-2 py-1">{formatAmount(group.igst)}</td>
                </>
              )}
              <td className="px-2 py-1">{formatAmount(group.cgst + group.sgst + group.igst)}</td>
            </tr>
          ))}
          <tr className="text-right font-semibold">
            <td className="px-2 py-1 text-left">Total</td>
            <td className="px-2 py-1">{formatAmount(priced.taxablePaise)}</td>
            {priced.intra ? (
              <>
                <td />
                <td className="px-2 py-1">{formatAmount(priced.cgstPaise)}</td>
                <td />
                <td className="px-2 py-1">{formatAmount(priced.sgstPaise)}</td>
              </>
            ) : (
              <>
                <td />
                <td className="px-2 py-1">{formatAmount(priced.igstPaise)}</td>
              </>
            )}
            <td className="px-2 py-1">{formatAmount(priced.cgstPaise + priced.sgstPaise + priced.igstPaise)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function unitName(unit: Unit) {
  return unit === 'QTL' ? 'Quntl' : 'Kg'
}

function govtDate(iso: string) {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  return `${day}-${MONTHS[Number(month) - 1]}-${year.slice(2)}`
}
