import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Card, PageHeader, SelectField, TextArea, TextField } from '../components'
import { emptySecrets, validateSeller, type IntegrationMode, type SandboxSecrets, type Settings } from '../model'
import { applyCompanyFlags, readSandboxCompany } from '../sandboxApi'
import { useBilling } from '../store'

export function SettingsPage() {
  const { settings, saveSettings } = useBilling()
  const [form, setForm] = useState<Settings>(settings)
  const [secrets, setSecrets] = useState<SandboxSecrets>(emptySecrets)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<'success' | 'error'>('success')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    void readSandboxCompany().then((company) => {
      if (!live || !company) return
      setForm((current) => applyCompanyFlags(current, company))
    })
    return () => {
      live = false
    }
  }, [])

  function patch(partial: Partial<Settings>) {
    setForm((current) => ({ ...current, ...partial }))
    setNotice('')
  }

  function onLogo(file: File | undefined) {
    if (!file) return
    if (file.size > 250000) {
      setErrors(['Use a logo under 250 KB.'])
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      patch({ logoDataUrl: String(reader.result || '') })
      setErrors([])
    }
    reader.readAsDataURL(file)
  }

  function secret(field: keyof SandboxSecrets, value: string) {
    setSecrets((current) => ({ ...current, [field]: value }))
    setNotice('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validateSeller(form)
    setErrors(nextErrors)
    if (nextErrors.length) return
    setSaving(true)
    const problem = await saveSettings(form, secrets)
    setSaving(false)
    if (problem) {
      setNoticeTone('error')
      setNotice(`Company details stayed in this browser. Sandbox was not saved: ${problem}`)
      return
    }
    setForm((current) => ({
      ...current,
      irpClientSecretSet: current.irpClientSecretSet || Boolean(secrets.irpClientSecret.trim()),
      irpPasswordSet: current.irpPasswordSet || Boolean(secrets.irpPassword.trim()),
      irpPublicKeySet: current.irpPublicKeySet || Boolean(secrets.irpPublicKey.trim()),
      ewbClientSecretSet: current.ewbClientSecretSet || Boolean(secrets.ewbClientSecret.trim()),
      ewbPasswordSet: current.ewbPasswordSet || Boolean(secrets.ewbPassword.trim()),
      ewbPublicKeySet: current.ewbPublicKeySet || Boolean(secrets.ewbPublicKey.trim()),
    }))
    setSecrets(emptySecrets)
    setNoticeTone('success')
    setNotice(form.integrationMode === 'MOCK'
      ? 'Company details saved. Portal mode is MOCK, so the sandbox was not called.'
      : 'Sandbox settings saved on the server. Passwords and keys are not kept in this browser.')
  }

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader title="Company & API settings" description="Sandbox keys are saved on the billing server. This browser keeps the client id and username only." actions={<Button type="submit" loading={saving}>Save settings</Button>} />
      {notice ? <Alert tone={noticeTone}>{notice}</Alert> : null}
      {errors.length ? <div className="mt-3"><Alert tone="error">{errors.join(' ')}</Alert></div> : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-navy">Company</h2>
          <div className="grid gap-4">
            <TextField label="Company name" required value={form.tradeName} onChange={(tradeName) => patch({ tradeName, legalName: tradeName })} />
            <TextField label="GSTIN" required value={form.gstin} onChange={(gstin) => patch({ gstin: gstin.toUpperCase() })} />
            <TextField label="PAN" value={form.pan ?? ''} onChange={(pan) => patch({ pan: pan.toUpperCase() })} />
            <TextField label="Address" required value={form.address} onChange={(address) => patch({ address })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="City" value={form.city} onChange={(city) => patch({ city })} />
              <TextField label="State" value={form.stateName} onChange={(stateName) => patch({ stateName })} />
              <TextField label="State code" required value={form.stateCode} onChange={(stateCode) => patch({ stateCode })} />
              <TextField label="PIN code" required value={form.pincode} onChange={(pincode) => patch({ pincode })} />
              <TextField label="Phone" value={form.phone} onChange={(phone) => patch({ phone })} />
              <TextField label="Email" type="email" value={form.email} onChange={(email) => patch({ email })} />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Company logo</p>
              {form.logoDataUrl ? <img src={form.logoDataUrl} alt="Company logo" className="mb-2 h-16 object-contain" /> : <p className="mb-2 text-sm text-slate-500">No logo uploaded.</p>}
              <input type="file" accept="image/*" onChange={(event) => onLogo(event.target.files?.[0])} className="block w-full text-sm text-slate-600" />
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 text-base font-semibold text-navy">Environment</h2>
            <SelectField
              label="Portal mode"
              value={form.integrationMode}
              onChange={(integrationMode) => patch({ integrationMode: integrationMode as IntegrationMode })}
              options={[{ value: 'SANDBOX', label: 'Sandbox' }, { value: 'MOCK', label: 'MOCK / TEST ONLY' }, { value: 'PRODUCTION', label: 'Production (disabled)' }]}
              hint={modeHint(form.integrationMode)}
            />
          </Card>
          <Card>
            <h2 className="mb-4 text-base font-semibold text-navy">e-Invoice sandbox</h2>
            <div className="grid gap-4">
              <TextField label="Client ID" value={form.irpClientId} onChange={(irpClientId) => patch({ irpClientId })} autoComplete="off" />
              <TextField label="Client secret" type="password" value={secrets.irpClientSecret} onChange={(value) => secret('irpClientSecret', value)} autoComplete="new-password" hint={savedHint(form.irpClientSecretSet)} />
              <TextField label="API username" value={form.irpUsername} onChange={(irpUsername) => patch({ irpUsername })} autoComplete="off" />
              <TextField label="API password" type="password" value={secrets.irpPassword} onChange={(value) => secret('irpPassword', value)} autoComplete="new-password" hint={savedHint(form.irpPasswordSet)} />
              <TextArea label="NIC public key" value={secrets.irpPublicKey} onChange={(value) => secret('irpPublicKey', value)} placeholder="Paste the sandbox public key" hint={savedHint(form.irpPublicKeySet)} />
            </div>
          </Card>
          <Card>
            <h2 className="mb-4 text-base font-semibold text-navy">e-Way sandbox</h2>
            <div className="grid gap-4">
              <TextField label="Client ID" value={form.ewbClientId} onChange={(ewbClientId) => patch({ ewbClientId })} autoComplete="off" />
              <TextField label="Client secret" type="password" value={secrets.ewbClientSecret} onChange={(value) => secret('ewbClientSecret', value)} autoComplete="new-password" hint={savedHint(form.ewbClientSecretSet)} />
              <TextField label="API username" value={form.ewbUsername} onChange={(ewbUsername) => patch({ ewbUsername })} autoComplete="off" />
              <TextField label="API password" type="password" value={secrets.ewbPassword} onChange={(value) => secret('ewbPassword', value)} autoComplete="new-password" hint={savedHint(form.ewbPasswordSet)} />
              <TextArea label="NIC public key" value={secrets.ewbPublicKey} onChange={(value) => secret('ewbPublicKey', value)} placeholder="Paste the sandbox public key" hint={savedHint(form.ewbPublicKeySet)} />
            </div>
          </Card>
        </div>
      </div>
    </form>
  )
}

function modeHint(mode: IntegrationMode) {
  if (mode === 'PRODUCTION') return 'Production calls stay off on this server. Use Sandbox.'
  if (mode === 'MOCK') return 'MOCK prepares nothing for the government. No IRN is created.'
  return 'Sandbox sends the bill to the NIC test servers after these keys are saved.'
}

function savedHint(saved: boolean) {
  return saved ? 'Already saved on the server. Leave blank to keep it.' : 'Leave blank until you have this value from the sandbox portal.'
}
