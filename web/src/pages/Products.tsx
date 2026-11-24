import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, errorMessage, type Hsn, type Product } from '../api'

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  unit: z.enum(['QTL', 'BAG', 'KGS', 'MTS', 'NOS']),
  hsnId: z.number().int().positive('Select an HSN code'),
})

type FormValues = z.infer<typeof schema>

export function ProductsPage() {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Product | null | undefined>(undefined)
  const [confirm, setConfirm] = useState<Product | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text), 300)
    return () => clearTimeout(timer)
  }, [text])
  const products = useQuery({
    queryKey: ['products', search],
    queryFn: async () => (await api.get<Product[]>('/api/products', { params: { search } })).data,
  })
  const hsn = useQuery({ queryKey: ['hsn'], queryFn: async () => (await api.get<Hsn[]>('/api/hsn')).data })
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', unit: 'QTL', hsnId: 0 } })
  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = { ...values, active: editing?.active ?? true }
      if (editing?.id) return (await api.put(`/api/products/${editing.id}`, payload)).data
      return (await api.post('/api/products', payload)).data
    },
    onSuccess: async () => {
      setEditing(undefined)
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })
  const deactivate = useMutation({
    mutationFn: async (product: Product) => api.put(`/api/products/${product.id}`, { name: product.name, unit: product.unit, hsnId: product.hsn?.id, active: false }),
    onSuccess: async () => {
      setConfirm(null)
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })

  function open(product?: Product) {
    setEditing(product ?? null)
    form.reset({ name: product?.name ?? '', unit: (product?.unit as FormValues['unit']) ?? 'QTL', hsnId: product?.hsn?.id ?? 0 })
    save.reset()
  }

  const selectedHsn = hsn.data?.find((row) => row.id === Number(form.watch('hsnId')))

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
        <div>
          <Typography variant="h5">Products</Typography>
          <Typography color="text.secondary">GST rate comes from the selected HSN code.</Typography>
        </div>
        <Button variant="contained" onClick={() => open()}>Add product</Button>
      </Stack>
      <TextField label="Search product" value={text} onChange={(event) => setText(event.target.value)} />
      {products.isLoading && <Typography>Loading products…</Typography>}
      {products.isError && <Alert severity="error">{errorMessage(products.error)}</Alert>}
      {products.data && (
        <Paper sx={{ overflow: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>HSN</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell align="right">GST %</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {products.data.map((product) => (
                <TableRow key={product.id} hover>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.hsn?.code}</TableCell>
                  <TableCell>{product.unit}</TableCell>
                  <TableCell align="right">{product.gstRate}</TableCell>
                  <TableCell>{product.active ? 'Active' : 'Inactive'}</TableCell>
                  <TableCell align="right">
                    <Button onClick={() => open(product)}>Edit</Button>
                    {product.active && <Button color="secondary" onClick={() => setConfirm(product)}>Deactivate</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {products.data.length === 0 && <TableRow><TableCell colSpan={6}>No products match this search.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}
      <Dialog open={editing !== undefined} onClose={() => setEditing(undefined)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Edit product' : 'New product'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }} component="form" id="product-form" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
            {save.isError && <Alert severity="error">{errorMessage(save.error)}</Alert>}
            {hsn.isError && <Alert severity="error">{errorMessage(hsn.error)}</Alert>}
            <TextField label="Name" {...form.register('name')} error={Boolean(form.formState.errors.name)} helperText={form.formState.errors.name?.message} />
            <TextField select label="Unit" value={form.watch('unit')} onChange={(event) => form.setValue('unit', event.target.value as FormValues['unit'])}>
              {['QTL', 'BAG', 'KGS', 'MTS', 'NOS'].map((unit) => <MenuItem key={unit} value={unit}>{unit}</MenuItem>)}
            </TextField>
            <TextField select label="HSN" value={form.watch('hsnId') || ''} onChange={(event) => form.setValue('hsnId', Number(event.target.value), { shouldValidate: true })} error={Boolean(form.formState.errors.hsnId)} helperText={form.formState.errors.hsnId?.message ?? (selectedHsn ? `GST ${selectedHsn.gstRate}%` : 'Confirm the rate with your CA')}>
              {(hsn.data ?? []).map((row) => <MenuItem key={row.id} value={row.id}>{row.code} — {row.description}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(undefined)}>Cancel</Button>
          <Button type="submit" form="product-form" variant="contained" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        <DialogTitle>Deactivate product</DialogTitle>
        <DialogContent>Deactivate {confirm?.name}? Past invoices keep their own snapshot.</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button color="secondary" variant="contained" onClick={() => confirm && deactivate.mutate(confirm)} disabled={deactivate.isPending}>Deactivate</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
