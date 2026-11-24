import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, errorMessage, inr, type Customer } from '../api'

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  address: z.string().trim().min(3, 'Address is required'),
  city: z.string().trim().min(2, 'City is required'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'PIN code must be 6 digits'),
  gstin: z.string(),
  stateName: z.string().trim().min(2, 'State is required'),
  stateCode: z.string().regex(/^[0-9]{2}$/, 'State code must be 2 digits'),
  mobile: z.string(),
  email: z.string(),
  openingBalance: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount'),
  creditLimit: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount'),
  paymentTerms: z.string(),
})

type FormValues = z.infer<typeof schema>

const blank: FormValues = {
  name: '', address: '', city: '', pincode: '', gstin: '', stateName: 'Madhya Pradesh', stateCode: '23',
  mobile: '', email: '', openingBalance: '0.00', creditLimit: '0.00', paymentTerms: '',
}

export function CustomersPage() {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined)
  const [confirm, setConfirm] = useState<Customer | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text), 300)
    return () => clearTimeout(timer)
  }, [text])
  const customers = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => (await api.get<Customer[]>('/api/customers', { params: { search } })).data,
  })
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: blank })
  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = { ...values, active: editing?.active ?? true }
      if (editing?.id) return (await api.put<Customer>(`/api/customers/${editing.id}`, payload)).data
      return (await api.post<Customer>('/api/customers', payload)).data
    },
    onSuccess: async () => {
      setEditing(undefined)
      await queryClient.invalidateQueries({ queryKey: ['customers'] })
      await queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })
  const deactivate = useMutation({
    mutationFn: async (customer: Customer) => api.put(`/api/customers/${customer.id}`, { ...customer, active: false }),
    onSuccess: async () => {
      setConfirm(null)
      await queryClient.invalidateQueries({ queryKey: ['customers'] })
      await queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })

  function open(customer?: Customer) {
    setEditing(customer ?? null)
    form.reset(customer ? {
      name: customer.name,
      address: customer.address,
      city: customer.city,
      pincode: customer.pincode,
      gstin: customer.gstin ?? '',
      stateName: customer.stateName,
      stateCode: customer.stateCode,
      mobile: customer.mobile ?? '',
      email: customer.email ?? '',
      openingBalance: customer.openingBalance,
      creditLimit: customer.creditLimit,
      paymentTerms: customer.paymentTerms ?? '',
    } : blank)
    save.reset()
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
        <div>
          <Typography variant="h5">Customers</Typography>
          <Typography color="text.secondary">Buyer master for sales invoices.</Typography>
        </div>
        <Button variant="contained" onClick={() => open()}>Add customer</Button>
      </Stack>
      <TextField label="Search name, GSTIN or city" value={text} onChange={(event) => setText(event.target.value)} />
      {customers.isLoading && <Typography>Loading customers…</Typography>}
      {customers.isError && <Alert severity="error">{errorMessage(customers.error)}</Alert>}
      {customers.data && (
        <Paper sx={{ overflow: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>GSTIN</TableCell>
                <TableCell>City</TableCell>
                <TableCell>State</TableCell>
                <TableCell align="right">Opening</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.data.map((customer) => (
                <TableRow key={customer.id} hover>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell>{customer.gstin || '—'}</TableCell>
                  <TableCell>{customer.city}</TableCell>
                  <TableCell>{customer.stateCode}</TableCell>
                  <TableCell align="right">{inr(customer.openingBalance)}</TableCell>
                  <TableCell>{customer.active ? 'Active' : 'Inactive'}</TableCell>
                  <TableCell align="right">
                    <Button onClick={() => open(customer)}>Edit</Button>
                    {customer.active && <Button color="secondary" onClick={() => setConfirm(customer)}>Deactivate</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {customers.data.length === 0 && (
                <TableRow><TableCell colSpan={7}>No customers match this search.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}
      <Dialog open={editing !== undefined} onClose={() => setEditing(undefined)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Edit customer' : 'New customer'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }} component="form" id="customer-form" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
            {save.isError && <Alert severity="error">{errorMessage(save.error)}</Alert>}
            <TextField label="Name" {...form.register('name')} error={Boolean(form.formState.errors.name)} helperText={form.formState.errors.name?.message} />
            <TextField label="Address" {...form.register('address')} error={Boolean(form.formState.errors.address)} helperText={form.formState.errors.address?.message} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="City" {...form.register('city')} error={Boolean(form.formState.errors.city)} helperText={form.formState.errors.city?.message} />
              <TextField label="PIN code" {...form.register('pincode')} error={Boolean(form.formState.errors.pincode)} helperText={form.formState.errors.pincode?.message} />
            </Stack>
            <TextField label="GSTIN" {...form.register('gstin')} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="State" {...form.register('stateName')} error={Boolean(form.formState.errors.stateName)} helperText={form.formState.errors.stateName?.message} />
              <TextField label="State code" {...form.register('stateCode')} error={Boolean(form.formState.errors.stateCode)} helperText={form.formState.errors.stateCode?.message} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Mobile" {...form.register('mobile')} />
              <TextField label="Email" {...form.register('email')} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Opening balance" {...form.register('openingBalance')} error={Boolean(form.formState.errors.openingBalance)} helperText={form.formState.errors.openingBalance?.message} />
              <TextField label="Credit limit" {...form.register('creditLimit')} error={Boolean(form.formState.errors.creditLimit)} helperText={form.formState.errors.creditLimit?.message} />
            </Stack>
            <TextField label="Payment terms" {...form.register('paymentTerms')} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(undefined)}>Cancel</Button>
          <Button type="submit" form="customer-form" variant="contained" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        <DialogTitle>Deactivate customer</DialogTitle>
        <DialogContent>Deactivate {confirm?.name}? The record stays for old invoices.</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button color="secondary" variant="contained" onClick={() => confirm && deactivate.mutate(confirm)} disabled={deactivate.isPending}>Deactivate</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
