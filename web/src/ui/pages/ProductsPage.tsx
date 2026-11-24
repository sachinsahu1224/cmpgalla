import { useState } from 'react'
import { Alert, Button, Card, PageHeader, SelectField, TextField } from '../components'
import type { Product } from '../model'
import { useBilling } from '../store'

const empty = (): Product => ({ id: '', name: '', hsn: '', gstRate: 0 })

export function ProductsPage() {
  const { products, saveProduct, deleteProduct } = useBilling()
  const [form, setForm] = useState<Product>(empty)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function save() {
    const message = saveProduct(form)
    if (message) {
      setError(message)
      setNotice('')
      return
    }
    setError('')
    setNotice(form.id ? 'Product updated.' : 'Product added.')
    setForm(empty())
  }

  return (
    <div>
      <PageHeader title="Products" description="Add a grain, change its HSN or GST rate, or remove it from the list." />
      {error ? <div className="mb-4"><Alert tone="error">{error}</Alert></div> : null}
      {notice ? <div className="mb-4"><Alert tone="success">{notice}</Alert></div> : null}
      <Card className="mb-4">
        <h2 className="mb-4 text-base font-semibold text-navy">{form.id ? 'Update product' : 'Add product'}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label="Name" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
          <TextField label="HSN" required value={form.hsn} onChange={(hsn) => setForm((current) => ({ ...current, hsn }))} />
          <SelectField label="GST rate" value={String(form.gstRate)} onChange={(gstRate) => setForm((current) => ({ ...current, gstRate: Number(gstRate) }))} options={[{ value: '0', label: '0%' }, { value: '5', label: '5%' }, { value: '12', label: '12%' }, { value: '18', label: '18%' }, { value: '28', label: '28%' }]} />
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={save}>{form.id ? 'Update product' : 'Add product'}</Button>
          {form.id ? <Button variant="secondary" onClick={() => { setForm(empty()); setError(''); setNotice('') }}>Cancel</Button> : null}
        </div>
      </Card>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">HSN</th>
                <th className="py-2 pr-3 font-semibold">GST</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-slate-100">
                  <td className="py-3 pr-3 font-medium">{product.name}</td>
                  <td className="py-3 pr-3">{product.hsn}</td>
                  <td className="py-3 pr-3">{product.gstRate}%</td>
                  <td className="py-3">
                    <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setForm(product); setError(''); setNotice('') }}>Update</button>
                    <button type="button" className="ml-3 font-medium text-red-700 hover:underline" onClick={() => deleteProduct(product.id)}>Delete</button>
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
