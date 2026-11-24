import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, ButtonLink, Card, EmptyState, PageHeader, portalLabel, portalTone, TextField } from '../components'
import { downloadGovtPdf } from '../govtPdf'
import { buyerById, priceInvoice } from '../model'
import { formatInr } from '../money'
import { useBilling } from '../store'

export function HistoryPage() {
  const { invoices, settings, customers, deleteInvoice } = useBilling()
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const rows = useMemo(() => invoices.filter((invoice) => {
    const buyer = buyerById(customers, invoice.buyerId)?.name ?? ''
    const haystack = `${invoice.number} ${buyer}`.toLowerCase()
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false
    if (from && invoice.date < from) return false
    if (to && invoice.date > to) return false
    return true
  }), [invoices, customers, search, from, to])

  return (
    <div>
      <PageHeader title="Invoice history" description="Search the bills saved in this browser." actions={<ButtonLink to="/invoices/new">Create new invoice</ButtonLink>} />
      <Card className="mb-4">
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label="Search" value={search} onChange={setSearch} placeholder="Invoice number or customer" />
          <TextField label="From date" type="date" value={from} onChange={setFrom} />
          <TextField label="To date" type="date" value={to} onChange={setTo} />
        </div>
      </Card>
      {rows.length === 0 ? (
        <EmptyState title="No invoices match" body="Change the search or create a new bill." action={<ButtonLink to="/invoices/new" variant="secondary">Create invoice</ButtonLink>} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Number</th>
                  <th className="py-2 pr-3 font-semibold">Token</th>
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Customer</th>
                  <th className="py-2 pr-3 text-right font-semibold">Amount</th>
                  <th className="py-2 pr-3 font-semibold">e-Invoice</th>
                  <th className="py-2 pr-3 font-semibold">E-Way</th>
                  <th className="py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((invoice) => {
                  const total = priceInvoice(invoice, invoice.seller?.stateCode ?? settings.stateCode).totalPaise
                  return (
                    <tr key={invoice.id} className="border-b border-slate-100">
                      <td className="py-3 pr-3 font-medium">{invoice.number}</td>
                      <td className="py-3 pr-3">{invoice.tokenNo || '—'}</td>
                      <td className="py-3 pr-3">{invoice.date}</td>
                      <td className="py-3 pr-3">{buyerById(customers, invoice.buyerId)?.name ?? '—'}</td>
                      <td className="py-3 pr-3 text-right">{formatInr(total)}</td>
                      <td className="py-3 pr-3"><Badge tone={portalTone(invoice.einvoice.status)}>{portalLabel(invoice.einvoice.status)}</Badge></td>
                      <td className="py-3 pr-3"><Badge tone={portalTone(invoice.eway.status)}>{portalLabel(invoice.eway.status)}</Badge></td>
                      <td className="py-3">
                        <Link className="font-medium text-primary hover:underline" to={`/invoices/${invoice.id}/preview`}>View</Link>
                        <Link className="ml-3 font-medium text-primary hover:underline" to={`/invoices/${invoice.id}/edit`}>Update</Link>
                        <button type="button" className="ml-3 font-medium text-red-700 hover:underline" onClick={() => deleteInvoice(invoice.id)}>Delete</button>
                        <button type="button" className="ml-3 font-medium text-primary hover:underline" onClick={() => downloadGovtPdf(invoice, settings, customers)}>Download</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
