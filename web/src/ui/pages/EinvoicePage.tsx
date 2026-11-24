import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, PageHeader, portalLabel, portalTone } from '../components'
import { downloadGovtPdf } from '../govtPdf'
import { InvoiceBarcode, invoiceBarcodeText } from '../InvoiceBarcode'
import { acceptedIrn, buyerById, partyOf, priceInvoice } from '../model'
import { formatInr } from '../money'
import { useBilling, useInvoice } from '../store'

export function EinvoicePage() {
  const { id } = useParams()
  const invoice = useInvoice(id)
  const { settings, customers, requestEinvoice } = useBilling()
  const [loading, setLoading] = useState(false)
  if (!invoice) return <EmptyState title="Invoice not found" body="Open a bill from history, then request the e-invoice." action={<ButtonLink to="/invoices" variant="secondary">Invoice history</ButtonLink>} />

  const seller = invoice.seller ?? partyOf(settings)
  const buyer = buyerById(customers, invoice.buyerId)
  const priced = priceInvoice(invoice, seller.stateCode)
  const result = invoice.einvoice

  async function generate() {
    if (invoice!.status !== 'CONFIRMED') return
    setLoading(true)
    try {
      await requestEinvoice(invoice!.id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader title="e-Invoice" description="Sandbox sends this bill to the NIC test servers. IRN, acknowledgement and signed QR stay empty until that server returns them." actions={<Button variant="secondary" onClick={() => downloadGovtPdf(invoice, settings, customers)}>Download PDF</Button>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Invoice {invoice.number}</p>
              <h2 className="text-xl font-semibold text-navy">{buyer?.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{formatInr(priced.totalPaise)} · {priced.words}</p>
            </div>
            <Badge tone={portalTone(result.status)}>{portalLabel(result.status)}</Badge>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="IRN" value={acceptedIrn(result.irn) || '—'} />
            <Field label="Ack No." value={acceptedIrn(result.irn) ? result.ackNo || '—' : '—'} />
            <Field label="Ack Date" value={acceptedIrn(result.irn) ? result.ackDate || '—' : '—'} />
            <Field label="GSTIN/UIN" value={seller.gstin} />
            <Field label="Buyer GSTIN/UIN" value={buyer?.gstin || '—'} />
            <Field label="Invoice No." value={invoice.number || '—'} />
          </dl>
          <div className="mt-5">
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
        </Card>
        <div className="space-y-3">
          {invoice.status !== 'CONFIRMED' ? <Alert tone="error">Confirm the invoice on the preview page before requesting an e-invoice.</Alert> : null}
          {result.message ? <Alert tone={result.status === 'ERROR' || result.status === 'FAILED' ? 'error' : 'warning'}>{result.message}</Alert> : <Alert tone="warning">{settings.integrationMode === 'SANDBOX' ? 'Sandbox is on. Generate sends this bill to the GST sandbox. No IRN is stored until the portal returns one.' : 'MOCK / TEST ONLY. Generating here does not contact the GST portal.'}</Alert>}
          <Button onClick={generate} loading={loading} disabled={invoice.status !== 'CONFIRMED'}>Generate e-Invoice</Button>
          <div><ButtonLink to={`/invoices/${invoice.id}/eway`} variant="secondary">Continue to e-way bill</ButtonLink></div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-navy">{value}</dd></div>
}
