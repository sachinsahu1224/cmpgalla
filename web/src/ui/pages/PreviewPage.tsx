import { useNavigate, useParams } from 'react-router-dom'
import { Button, ButtonLink, EmptyState, PageHeader } from '../components'
import { InvoiceSheet } from '../InvoiceSheet'
import { useBilling, useInvoice } from '../store'

export function PreviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const invoice = useInvoice(id)
  const { settings, customers, confirmInvoice } = useBilling()
  if (!invoice) return <EmptyState title="Invoice not found" body="Choose a bill from history." action={<ButtonLink to="/invoices" variant="secondary">Invoice history</ButtonLink>} />

  return (
    <div>
      <PageHeader
        title="Invoice preview"
        description="This is the commercial tax invoice. It is not a government e-invoice."
        actions={
          <>
            {invoice.status === 'DRAFT' ? <ButtonLink to={`/invoices/${invoice.id}/edit`} variant="secondary">Edit invoice</ButtonLink> : null}
            {invoice.status === 'DRAFT' ? (
              <Button onClick={() => { confirmInvoice(invoice.id); navigate(`/invoices/${invoice.id}/einvoice`) }}>Confirm invoice</Button>
            ) : (
              <Button onClick={() => navigate(`/invoices/${invoice.id}/einvoice`)}>Continue to e-invoice</Button>
            )}
          </>
        }
      />
      <InvoiceSheet invoice={invoice} settings={settings} customers={customers} />
    </div>
  )
}
