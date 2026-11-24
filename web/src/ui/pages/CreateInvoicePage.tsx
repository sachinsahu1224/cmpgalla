import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, EmptyState, PageHeader, SelectField, TextField } from '../components'
import { buyerById, blankInvoice, blankLine, hsnRate, priceInvoice, validateInvoice, type Invoice, type InvoiceLine, type TransportMode, type Unit } from '../model'
import { formatInr } from '../money'
import { useBilling } from '../store'

export function CreateInvoicePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { invoices, settings, customers, products, saveInvoice } = useBilling()
  const existing = invoices.find((invoice) => invoice.id === id)
  const [invoice, setInvoice] = useState<Invoice>(() => existing ? structuredClone(existing) : blankInvoice(localToday()))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')

  if (id && !existing) {
    return <EmptyState title="Invoice not found" body="Choose a bill from history." action={<Button onClick={() => navigate('/invoices')}>Invoice history</Button>} />
  }

  const locked = invoice.status === 'CONFIRMED'
  const buyer = buyerById(customers, invoice.buyerId)
  const priced = priceInvoice(invoice, settings.stateCode)

  function patch(partial: Partial<Invoice>) {
    setInvoice((current) => ({ ...current, ...partial }))
  }

  function patchLine(lineId: string, partial: Partial<InvoiceLine>) {
    setInvoice((current) => ({
      ...current,
      lines: current.lines.map((line) => line.id === lineId ? { ...line, ...partial } : line),
    }))
  }

  function chooseProduct(lineId: string, productId: string) {
    const product = products.find((row) => row.id === productId)
    if (!product) return
    patchLine(lineId, { description: product.name, hsn: product.hsn, gstRate: product.gstRate })
  }

  function persist() {
    const nextErrors = validateInvoice(invoice, invoices.map((row) => ({ id: row.id, number: row.number })))
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setNotice('')
      return null
    }
    return saveInvoice(invoice)
  }

  return (
    <div>
      <PageHeader title={locked ? `Invoice ${invoice.number}` : id ? 'Edit invoice' : 'Create invoice'} description="Quantity can be in kilograms or quintals. 1 quintal = 100 kg. CGST, SGST and IGST are added by the portal." />
      {locked ? <Alert tone="info">This invoice is confirmed. Create a new bill if the details need to change.</Alert> : null}
      {notice ? <div className="mt-3"><Alert tone="success">{notice}</Alert></div> : null}
      {errors.lines ? <div className="mt-3"><Alert tone="error">{errors.lines}</Alert></div> : null}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-base font-semibold text-navy">Seller</h2>
            <p className="text-sm font-medium">{settings.tradeName}</p>
            <p className="mt-1 text-sm text-slate-600">{settings.address}</p>
            <p className="text-sm text-slate-600">{settings.city} {settings.pincode}, {settings.stateName} · State {settings.stateCode}</p>
            <p className="text-sm text-slate-600">GSTIN {settings.gstin} · {settings.phone}</p>
          </Card>
          <Card>
            <h2 className="mb-4 text-base font-semibold text-navy">Buyer</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Buyer"
                required
                value={invoice.buyerId}
                error={errors.buyerId}
                disabled={locked}
                onChange={(buyerId) => {
                  const selected = buyerById(customers, buyerId)
                  patch({ buyerId, placeOfSupply: selected?.stateCode ?? invoice.placeOfSupply })
                }}
                options={[{ value: '', label: 'Select a buyer' }, ...customers.map((row) => ({ value: row.id, label: row.name }))]}
              />
              <TextField label="Place of supply" required value={invoice.placeOfSupply} onChange={(placeOfSupply) => patch({ placeOfSupply })} error={errors.placeOfSupply} disabled={locked} hint="2-digit state code. Sent to the portal with the invoice." />
              <TextField label="Invoice number" value={invoice.number} onChange={(number) => patch({ number })} error={errors.number} disabled={locked} hint="Leave blank for the next financial-year number." />
              <TextField label="Token number" value={invoice.tokenNo} onChange={(tokenNo) => patch({ tokenNo })} disabled={locked} hint="Mandi token. Printed as Reference No." />
              <TextField label="Invoice date" type="date" required value={invoice.date} onChange={(date) => patch({ date })} error={errors.date} disabled={locked} />
            </div>
            {buyer ? (
              <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium text-navy">{buyer.name}</p>
                <p>{buyer.address}, {buyer.city} {buyer.pincode}</p>
                <p>GSTIN {buyer.gstin} · {buyer.stateName} ({buyer.stateCode})</p>
              </div>
            ) : null}
          </Card>
          {invoice.lines.map((line, index) => (
            <Card key={line.id}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-navy">Item {index + 1}</h2>
                {!locked && invoice.lines.length > 1 ? (
                  <button type="button" className="inline-flex items-center gap-1 text-sm text-red-700" onClick={() => patch({ lines: invoice.lines.filter((row) => row.id !== line.id) })}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SelectField label="Product" value="" disabled={locked} onChange={(productId) => chooseProduct(line.id, productId)} options={[{ value: '', label: 'Fill from product master' }, ...products.map((product) => ({ value: product.id, label: `${product.name} · ${product.gstRate}%` }))]} />
                <TextField label="Description" required value={line.description} disabled={locked} error={errors[`${line.id}-description`]} onChange={(description) => patchLine(line.id, { description })} />
                <TextField label="HSN" required value={line.hsn} disabled={locked} error={errors[`${line.id}-hsn`]} onChange={(hsn) => patchLine(line.id, { hsn, gstRate: hsnRate(products, hsn) ?? line.gstRate })} />
                <TextField label="Quantity" required value={line.quantity} disabled={locked} error={errors[`${line.id}-quantity`]} onChange={(quantity) => patchLine(line.id, { quantity })} />
                <SelectField label="Quantity unit" value={line.quantityUnit} disabled={locked} onChange={(quantityUnit) => patchLine(line.id, { quantityUnit: quantityUnit as Unit })} options={[{ value: 'QTL', label: 'Quintal' }, { value: 'KG', label: 'KG' }]} />
                <TextField label="Rate" required value={line.rate} disabled={locked} error={errors[`${line.id}-rate`]} onChange={(rate) => patchLine(line.id, { rate })} />
                <SelectField label="Rate unit" value={line.rateUnit} disabled={locked} onChange={(rateUnit) => patchLine(line.id, { rateUnit: rateUnit as Unit })} options={[{ value: 'QTL', label: 'Per quintal' }, { value: 'KG', label: 'Per kg' }]} />
                <SelectField label="GST rate" value={String(line.gstRate)} disabled={locked} onChange={(gstRate) => patchLine(line.id, { gstRate: Number(gstRate) })} options={[{ value: '0', label: '0%' }, { value: '5', label: '5%' }, { value: '12', label: '12%' }, { value: '18', label: '18%' }, { value: '28', label: '28%' }]} />
                <TextField label="Discount" value={line.discount} disabled={locked} onChange={(discount) => patchLine(line.id, { discount })} hint="Deducted once from the item amount." />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Amount label="Amount" value={formatInr(priced.lines[index]?.taxablePaise ?? 0)} />
              </div>
            </Card>
          ))}
          {!locked ? (
            <Button variant="secondary" onClick={() => patch({ lines: [...invoice.lines, blankLine()] })}><Plus className="h-4 w-4" />Add item</Button>
          ) : null}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-navy">Transport</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Transporter" value={invoice.transporterName} disabled={locked} onChange={(transporterName) => patch({ transporterName })} />
              <TextField label="Transporter ID" value={invoice.transporterId} disabled={locked} onChange={(transporterId) => patch({ transporterId })} hint="GSTIN of the transporter, when available." />
              <TextField label="Vehicle number" value={invoice.vehicleNo} disabled={locked} error={errors.vehicleNo} onChange={(vehicleNo) => patch({ vehicleNo: vehicleNo.toUpperCase() })} />
              <SelectField label="Transport mode" value={invoice.transportMode} disabled={locked} onChange={(transportMode) => patch({ transportMode: transportMode as TransportMode })} options={[{ value: 'ROAD', label: 'Road' }, { value: 'RAIL', label: 'Rail' }, { value: 'AIR', label: 'Air' }, { value: 'SHIP', label: 'Ship' }]} />
              <TextField label="Distance (km)" value={invoice.distanceKm} disabled={locked} error={errors.distanceKm} onChange={(distanceKm) => patch({ distanceKm })} hint="0 lets the portal calculate the distance from PIN codes." />
              <TextField label="Bora Bardaan (Nag)" value={invoice.bardanaBags ?? ''} disabled={locked} onChange={(bardanaBags) => patch({ bardanaBags })} hint="Printed on the invoice. Not added to the taxable value." />
              <TextField label="Additional charges" value={invoice.additionalCharges} disabled={locked} onChange={(additionalCharges) => patch({ additionalCharges })} hint="Added to the invoice total." />
            </div>
          </Card>
        </div>
        <Card className="h-fit xl:sticky xl:top-20">
          <h2 className="text-base font-semibold text-navy">Invoice total</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Total label="Amount" value={formatInr(priced.taxablePaise)} />
            <Total label="CGST" value={formatInr(priced.cgstPaise)} />
            <Total label="SGST" value={formatInr(priced.sgstPaise)} />
            <Total label="IGST" value={formatInr(priced.igstPaise)} />
            <Total label="Additional charges" value={formatInr(priced.additionalPaise)} />
            <Total label="Round off" value={formatInr(priced.roundOffPaise)} />
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-navy">
              <dt>Total</dt>
              <dd>{formatInr(priced.totalPaise)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-slate-600">{priced.words}</p>
          {!locked ? (
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="secondary" onClick={() => {
                const saved = persist()
                if (saved) setNotice(`Draft ${saved.number} saved.`)
              }}>Save draft</Button>
              <Button onClick={() => {
                const saved = persist()
                if (saved) navigate(`/invoices/${saved.id}/preview`)
              }}>Preview invoice</Button>
            </div>
          ) : (
            <div className="mt-4"><Button variant="secondary" onClick={() => navigate(`/invoices/${invoice.id}/preview`)}>Open preview</Button></div>
          )}
        </Card>
      </div>
    </div>
  )
}

function localToday() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function Amount({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 px-3 py-2"><p className="text-xs text-slate-500">{label}</p><p className="font-medium">{value}</p></div>
}

function Total({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><dt className="text-slate-600">{label}</dt><dd>{value}</dd></div>
}
