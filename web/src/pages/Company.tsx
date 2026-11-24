import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, errorMessage, type Company } from '../api'

const schema = z.object({
  legalName: z.string().trim().min(2, 'Legal name is required'),
  tradeName: z.string().trim().min(2, 'Trade name is required'),
  gstin: z.string().trim().min(15, 'GSTIN is required'),
  pan: z.string(),
  address: z.string().trim().min(5, 'Address is required'),
  city: z.string().trim().min(2, 'City is required'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'PIN code must be 6 digits'),
  stateName: z.string().trim().min(2, 'State is required'),
  stateCode: z.string().regex(/^[0-9]{2}$/, 'State code must be 2 digits'),
  phone: z.string(),
  email: z.string(),
  bankName: z.string(),
  accountNo: z.string(),
  ifsc: z.string(),
  branch: z.string(),
  gstEnv: z.enum(['SANDBOX', 'PRODUCTION']),
  irpClientId: z.string(),
  irpClientSecret: z.string(),
  irpUsername: z.string(),
  irpPassword: z.string(),
  irpPublicKey: z.string(),
  ewbClientId: z.string(),
  ewbClientSecret: z.string(),
  ewbUsername: z.string(),
  ewbPassword: z.string(),
  ewbPublicKey: z.string(),
  integrationMode: z.enum(['MOCK', 'SANDBOX', 'PRODUCTION']),
  shortageMode: z.enum(['NONE', 'QUANTITY', 'AMOUNT']),
  bardanaMode: z.enum(['NONE', 'PER_BAG', 'FLAT']),
  bardanaRate: z.string(),
})

type FormValues = z.infer<typeof schema>

const empty = {
  legalName: '', tradeName: '', gstin: '', pan: '', address: '', city: '', pincode: '', stateName: '', stateCode: '',
  phone: '', email: '', bankName: '', accountNo: '', ifsc: '', branch: '', gstEnv: 'SANDBOX' as const,
  irpClientId: '', irpClientSecret: '', irpUsername: '', irpPassword: '', irpPublicKey: '',
  ewbClientId: '', ewbClientSecret: '', ewbUsername: '', ewbPassword: '', ewbPublicKey: '',
  integrationMode: 'MOCK' as const, shortageMode: 'QUANTITY' as const, bardanaMode: 'NONE' as const, bardanaRate: '0.00',
}

export function CompanyPage() {
  const queryClient = useQueryClient()
  const company = useQuery({ queryKey: ['company'], queryFn: async () => (await api.get<Company>('/api/company')).data })
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: empty })
  const save = useMutation({
    mutationFn: async (values: FormValues) => (await api.put<Company>('/api/company', values)).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(['company'], saved)
      form.reset(toForm(saved))
    },
  })

  useEffect(() => {
    if (company.data) form.reset(toForm(company.data))
  }, [company.data, form])

  if (company.isLoading) return <Typography>Loading company…</Typography>
  if (company.isError) return <Alert severity="error">{errorMessage(company.error)}</Alert>

  const saved = company.data!

  return (
    <Stack spacing={3} component="form" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div>
        <Typography variant="h5">Company</Typography>
        <Typography color="text.secondary">GST portal passwords stay on the server. A blank secret field keeps the saved value.</Typography>
      </div>
      {save.isError && <Alert severity="error">{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert severity="success">Company saved.</Alert>}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Business</Typography>
        <Stack spacing={2}>
          <Field form={form} name="legalName" label="Legal name" />
          <Field form={form} name="tradeName" label="Trade name" />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Field form={form} name="gstin" label="GSTIN" />
            <Field form={form} name="pan" label="PAN" />
          </Stack>
          <Field form={form} name="address" label="Address" />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Field form={form} name="city" label="City" />
            <Field form={form} name="pincode" label="PIN code" />
            <Field form={form} name="stateName" label="State" />
            <Field form={form} name="stateCode" label="State code" />
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Field form={form} name="phone" label="Phone" />
            <Field form={form} name="email" label="Email" />
          </Stack>
        </Stack>
      </Paper>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Bank</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Field form={form} name="bankName" label="Bank" />
          <Field form={form} name="accountNo" label="Account number" />
          <Field form={form} name="ifsc" label="IFSC" />
          <Field form={form} name="branch" label="Branch" />
        </Stack>
      </Paper>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>GST portal</Typography>
        <Stack spacing={2}>
          <TextField select label="Portal calls" value={form.watch('integrationMode')} onChange={(event) => form.setValue('integrationMode', event.target.value as FormValues['integrationMode'])}>
            <MenuItem value="MOCK">Mock / test only</MenuItem>
            <MenuItem value="SANDBOX">Sandbox</MenuItem>
            <MenuItem value="PRODUCTION" disabled>Production (disabled)</MenuItem>
          </TextField>
          <TextField select label="Shortage" value={form.watch('shortageMode')} onChange={(event) => form.setValue('shortageMode', event.target.value as FormValues['shortageMode'])}>
            <MenuItem value="NONE">No shortage</MenuItem>
            <MenuItem value="QUANTITY">Reduce billed weight once</MenuItem>
            <MenuItem value="AMOUNT">Deduct shortage amount once</MenuItem>
          </TextField>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField select label="Bardana" value={form.watch('bardanaMode')} onChange={(event) => form.setValue('bardanaMode', event.target.value as FormValues['bardanaMode'])}>
              <MenuItem value="NONE">No bardana</MenuItem>
              <MenuItem value="PER_BAG">Rate per bag</MenuItem>
              <MenuItem value="FLAT">Flat amount on the line</MenuItem>
            </TextField>
            <Field form={form} name="bardanaRate" label="Bardana rate per bag" />
          </Stack>
          <TextField select label="Portal host when sandbox or production is enabled" value={form.watch('gstEnv')} onChange={(event) => form.setValue('gstEnv', event.target.value as FormValues['gstEnv'])}>
            <MenuItem value="SANDBOX">Sandbox host</MenuItem>
            <MenuItem value="PRODUCTION">Production host</MenuItem>
          </TextField>
          <Typography color="text.secondary">
            e-Invoice secret saved: {saved.irpPasswordSet ? 'yes' : 'no'}. e-Way secret saved: {saved.ewbPasswordSet ? 'yes' : 'no'}.
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Field form={form} name="irpClientId" label="e-Invoice client id" />
            <Field form={form} name="irpUsername" label="e-Invoice username" />
          </Stack>
          <Field form={form} name="irpClientSecret" label="e-Invoice client secret" type="password" />
          <Field form={form} name="irpPassword" label="e-Invoice password" type="password" />
          <Field form={form} name="irpPublicKey" label="e-Invoice public key" />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Field form={form} name="ewbClientId" label="e-Way client id" />
            <Field form={form} name="ewbUsername" label="e-Way username" />
          </Stack>
          <Field form={form} name="ewbClientSecret" label="e-Way client secret" type="password" />
          <Field form={form} name="ewbPassword" label="e-Way password" type="password" />
          <Field form={form} name="ewbPublicKey" label="e-Way public key" />
        </Stack>
      </Paper>
      <Button type="submit" variant="contained" disabled={save.isPending} sx={{ alignSelf: 'flex-start' }}>
        {save.isPending ? 'Saving…' : 'Save company'}
      </Button>
    </Stack>
  )
}

function toForm(company: Company): FormValues {
  return {
    legalName: company.legalName,
    tradeName: company.tradeName,
    gstin: company.gstin,
    pan: company.pan ?? '',
    address: company.address,
    city: company.city,
    pincode: company.pincode,
    stateName: company.stateName,
    stateCode: company.stateCode,
    phone: company.phone ?? '',
    email: company.email ?? '',
    bankName: company.bankName ?? '',
    accountNo: company.accountNo ?? '',
    ifsc: company.ifsc ?? '',
    branch: company.branch ?? '',
    gstEnv: company.gstEnv,
    irpClientId: company.irpClientId ?? '',
    irpUsername: company.irpUsername ?? '',
    ewbClientId: company.ewbClientId ?? '',
    ewbUsername: company.ewbUsername ?? '',
    irpClientSecret: '',
    irpPassword: '',
    irpPublicKey: '',
    ewbClientSecret: '',
    ewbPassword: '',
    ewbPublicKey: '',
    integrationMode: company.integrationMode,
    shortageMode: company.shortageMode,
    bardanaMode: company.bardanaMode,
    bardanaRate: company.bardanaRate,
  }
}

function Field({ form, name, label, type }: { form: ReturnType<typeof useForm<FormValues>>; name: keyof FormValues; label: string; type?: string }) {
  const error = form.formState.errors[name]
  return <TextField label={label} type={type} fullWidth {...form.register(name)} error={Boolean(error)} helperText={error?.message} />
}
