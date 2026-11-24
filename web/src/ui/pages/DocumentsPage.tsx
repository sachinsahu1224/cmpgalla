import { useParams } from 'react-router-dom'
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, PageHeader, portalLabel, portalTone } from '../components'
import { downloadGovtPdf } from '../govtPdf'
import { useBilling, useInvoice } from '../store'

export function DocumentsPage() {
  const { id } = useParams()
  const invoice = useInvoice(id)
  const { settings, customers } = useBilling()
  if (!invoice) return <EmptyState title="No document selected" body="Open an invoice from history to view its commercial copy." action={<ButtonLink to="/invoices" variant="secondary">Invoice history</ButtonLink>} />

  return (
    <div>
      <PageHeader title="Documents" description="Download uses the government invoice layout. IRN, acknowledgement and e-way number are dummy data until the portal is connected." />
      <Alert tone="warning">DUMMY DATA. This PDF follows the government format. The portal has not issued these numbers.</Alert>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-navy">e-Invoice document</h2>
              <p className="mt-1 text-sm text-slate-600">Invoice {invoice.number || 'Draft'} · commercial copy</p>
            </div>
            <Badge tone={portalTone(invoice.einvoice.status)}>{portalLabel(invoice.einvoice.status)}</Badge>
          </div>
          <p className="mt-3 text-sm text-slate-600">The downloaded PDF uses dummy IRN, acknowledgement and e-way number.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink to={`/invoices/${invoice.id}/print`} variant="secondary">View PDF</ButtonLink>
            <Button onClick={() => downloadGovtPdf(invoice, settings, customers)}>Download PDF</Button>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-navy">E-Way bill document</h2>
              <p className="mt-1 text-sm text-slate-600">Vehicle {invoice.vehicleNo || 'not entered'} · {invoice.distanceKm || '0'} km</p>
            </div>
            <Badge tone={portalTone(invoice.eway.status)}>{portalLabel(invoice.eway.status)}</Badge>
          </div>
          <p className="mt-3 text-sm text-slate-600">The downloaded PDF uses a dummy e-way number and validity.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink to={`/invoices/${invoice.id}/print`} variant="secondary">View PDF</ButtonLink>
            <Button onClick={() => downloadGovtPdf(invoice, settings, customers)}>Download PDF</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
