import { FilePlus2, FolderDown, Receipt, Settings } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, ButtonLink, Card, PageHeader, portalLabel, portalTone } from '../components'
import { acceptedIrn, buyerById, priceInvoice } from '../model'
import { formatInr } from '../money'
import { useBilling } from '../store'

export function DashboardPage() {
  const { invoices, settings, customers } = useBilling()
  const recent = invoices.slice(0, 5)
  const issuedIrn = invoices.filter((invoice) => acceptedIrn(invoice.einvoice.irn)).length
  const issuedEway = invoices.filter((invoice) => invoice.eway.ewayNo).length

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Counts from this browser demo. Government IRNs and e-way numbers stay at zero until a portal response exists."
        actions={<ButtonLink to="/invoices/new"><FilePlus2 className="h-4 w-4" />Create new invoice</ButtonLink>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total invoices" value={String(invoices.length)} hint="Drafts and confirmed bills" />
        <Stat label="e-Invoice generated" value={String(issuedIrn)} hint="IRN count. None are invented." />
        <Stat label="E-Way bill generated" value={String(issuedEway)} hint="EWB count. None are invented." />
        <Card>
          <p className="text-sm text-slate-500">API connection</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-success">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            {settings.integrationMode}
          </p>
          <p className="mt-2 text-sm text-amber-800">{settings.integrationMode === 'SANDBOX' ? 'Sandbox. Generate on a confirmed bill sends it to the GST test servers.' : settings.integrationMode === 'PRODUCTION' ? 'Production stays switched off on this server.' : 'MOCK / TEST ONLY. This screen does not call the GST portal.'}</p>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Quick to="/invoices/new" icon={<FilePlus2 className="h-5 w-5" />} title="New invoice" body="Start a grain sale bill" />
        <Quick to="/einvoice" icon={<Receipt className="h-5 w-5" />} title="e-Invoice" body="Request status for a bill" />
        <Quick to="/documents" icon={<FolderDown className="h-5 w-5" />} title="Documents" body="Commercial invoice copy" />
        <Quick to="/settings" icon={<Settings className="h-5 w-5" />} title="Company & API" body="GSTIN and portal mode" />
      </div>
      <Card className="mt-4">
        <h2 className="mb-3 text-base font-semibold text-navy">Recent invoices</h2>
        {recent.length === 0 ? <p className="text-sm text-slate-600">No invoices yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Number</th>
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Customer</th>
                  <th className="py-2 pr-3 text-right font-semibold">Amount</th>
                  <th className="py-2 pr-3 font-semibold">e-Invoice</th>
                  <th className="py-2 font-semibold">E-Way</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((invoice) => {
                  const sellerState = invoice.seller?.stateCode ?? settings.stateCode
                  const total = priceInvoice(invoice, sellerState).totalPaise
                  return (
                    <tr key={invoice.id} className="border-b border-slate-100">
                      <td className="py-3 pr-3 font-medium"><Link className="text-primary hover:underline" to={`/invoices/${invoice.id}/preview`}>{invoice.number}</Link></td>
                      <td className="py-3 pr-3">{invoice.date}</td>
                      <td className="py-3 pr-3">{buyerById(customers, invoice.buyerId)?.name ?? '—'}</td>
                      <td className="py-3 pr-3 text-right">{formatInr(total)}</td>
                      <td className="py-3 pr-3"><Badge tone={portalTone(invoice.einvoice.status)}>{portalLabel(invoice.einvoice.status)}</Badge></td>
                      <td className="py-3"><Badge tone={portalTone(invoice.eway.status)}>{portalLabel(invoice.eway.status)}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-navy">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{hint}</p>
    </Card>
  )
}

function Quick({ to, icon, title, body }: { to: string; icon: ReactNode; title: string; body: string }) {
  return (
    <Link to={to} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-primary">
      <div className="text-primary">{icon}</div>
      <p className="mt-3 font-semibold text-navy">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </Link>
  )
}
