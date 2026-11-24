import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ButtonLink, EmptyState } from '../components'
import { downloadGovtPdf } from '../govtPdf'
import { InvoiceSheet } from '../InvoiceSheet'
import { useBilling, useInvoice } from '../store'

export function PrintPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const invoice = useInvoice(id)
  const { settings, customers, session } = useBilling()

  useEffect(() => {
    if (invoice && params.get('download') === '1') window.print()
  }, [invoice, params])

  if (!session) return null
  if (!invoice) return <div className="p-6"><EmptyState title="Invoice not found" body="Return to history and choose a bill." action={<ButtonLink to="/invoices" variant="secondary">Invoice history</ButtonLink>} /></div>

  return (
    <div className="min-h-screen bg-page font-sans">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-sm text-amber-800">MOCK / TEST ONLY. This is your commercial invoice, not a government PDF.</p>
        <div className="flex gap-2">
          <ButtonLink to={`/invoices/${invoice.id}/documents`} variant="secondary">Back</ButtonLink>
          <button type="button" onClick={() => downloadGovtPdf(invoice, settings, customers)} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white">Download PDF</button>
          <Link to="/" className="inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-navy">Close</Link>
        </div>
      </div>
      <div className="py-6">
        <InvoiceSheet invoice={invoice} settings={settings} customers={customers} />
      </div>
    </div>
  )
}
