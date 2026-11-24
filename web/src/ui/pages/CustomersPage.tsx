import { useState } from 'react'
import { Alert, Button, Card, PageHeader, TextField } from '../components'
import type { Buyer } from '../model'
import { useBilling } from '../store'

const empty = (): Buyer => ({ id: '', name: '', gstin: '', address: '', city: '', stateName: 'Madhya Pradesh', stateCode: '23', pincode: '' })

export function CustomersPage() {
  const { customers, saveCustomer, deleteCustomer } = useBilling()
  const [form, setForm] = useState<Buyer>(empty)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function patch(partial: Partial<Buyer>) {
    setForm((current) => ({ ...current, ...partial }))
  }

  function save() {
    const message = saveCustomer(form)
    if (message) {
      setError(message)
      setNotice('')
      return
    }
    setError('')
    setNotice(form.id ? 'Customer updated.' : 'Customer added.')
    setForm(empty())
  }

  return (
    <div>
      <PageHeader title="Customers" description="Add a buyer, change the saved details, or remove a buyer who is no longer used." />
      {error ? <div className="mb-4"><Alert tone="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-4"><Alert tone="success">{notice}</Alert></div> : null}
      <Card className="mb-4">
        <h2 className="mb-4 text-base font-semibold text-navy">{form.id ? 'Update customer' : 'Add customer'}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Name" required value={form.name} onChange={(name) => patch({ name })} />
          <TextField label="GSTIN" value={form.gstin} onChange={(gstin) => patch({ gstin: gstin.toUpperCase() })} />
          <TextField label="Address" value={form.address} onChange={(address) => patch({ address })} />
          <TextField label="City" value={form.city} onChange={(city) => patch({ city })} />
          <TextField label="State" value={form.stateName} onChange={(stateName) => patch({ stateName })} />
          <TextField label="State code" value={form.stateCode} onChange={(stateCode) => patch({ stateCode })} />
          <TextField label="PIN code" value={form.pincode} onChange={(pincode) => patch({ pincode })} />
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={save}>{form.id ? 'Update customer' : 'Add customer'}</Button>
          {form.id ? <Button variant="secondary" onClick={() => { setForm(empty()); setError(''); setNotice('') }}>Cancel</Button> : null}
        </div>
      </Card>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">GSTIN</th>
                <th className="py-2 pr-3 font-semibold">City</th>
                <th className="py-2 pr-3 font-semibold">State</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-slate-100">
                  <td className="py-3 pr-3 font-medium">{customer.name}</td>
                  <td className="py-3 pr-3">{customer.gstin || '—'}</td>
                  <td className="py-3 pr-3">{customer.city || '—'}</td>
                  <td className="py-3 pr-3">{customer.stateName} ({customer.stateCode})</td>
                  <td className="py-3">
                    <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setForm(customer); setError(''); setNotice('') }}>Update</button>
                    <button type="button" className="ml-3 font-medium text-red-700 hover:underline" onClick={() => deleteCustomer(customer.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
