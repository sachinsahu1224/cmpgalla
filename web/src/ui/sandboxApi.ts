import { acceptedIrn, emptyPortal, type Buyer, type Invoice, type PortalResult, type PortalStatus, type SandboxSecrets, type Settings } from './model'

const TOKEN_KEY = 'galla.token'

function apiUrl(path: string) {
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  return `${base}${path}`
}

function apiDownMessage() {
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  return base ? `Billing API is not reachable at ${base}.` : 'Billing API is not running on port 4000.'
}

type CompanyRow = {
  shortageMode: string
  bardanaMode: string
  bardanaRate: string
  irpClientId: string | null
  irpUsername: string | null
  ewbClientId: string | null
  ewbUsername: string | null
  irpClientSecretSet: boolean
  irpPasswordSet: boolean
  irpPublicKeySet: boolean
  ewbClientSecretSet: boolean
  ewbPasswordSet: boolean
  ewbPublicKeySet: boolean
}

type CustomerRow = { id: number; name: string; gstin: string | null }
type HsnRow = { code: string }
type InvoiceRow = { id: number; number: string; status: string }

type PortalRecord = {
  status?: string
  portalMessage?: string | null
  irn?: string | null
  ackNo?: string | null
  ackDate?: string | null
  ewayNo?: string | null
  validUpto?: string | null
  generatedAt?: string | null
  signedQr?: string | null
}

export function applyCompanyFlags(settings: Settings, company: CompanyRow): Settings {
  return {
    ...settings,
    irpClientId: company.irpClientId ?? settings.irpClientId,
    irpUsername: company.irpUsername ?? settings.irpUsername,
    ewbClientId: company.ewbClientId ?? settings.ewbClientId,
    ewbUsername: company.ewbUsername ?? settings.ewbUsername,
    irpClientSecretSet: company.irpClientSecretSet,
    irpPasswordSet: company.irpPasswordSet,
    irpPublicKeySet: company.irpPublicKeySet,
    ewbClientSecretSet: company.ewbClientSecretSet,
    ewbPasswordSet: company.ewbPasswordSet,
    ewbPublicKeySet: company.ewbPublicKeySet,
  }
}

export async function readSandboxCompany() {
  try {
    await ensureSession()
    return await request<CompanyRow>('/api/company')
  } catch {
    return null
  }
}

export async function pushSandboxCompany(settings: Settings, secrets: SandboxSecrets) {
  await ensureSession()
  const current = await request<CompanyRow>('/api/company')
  return request<CompanyRow>('/api/company', {
    method: 'PUT',
    body: {
      legalName: settings.legalName,
      tradeName: settings.tradeName,
      gstin: settings.gstin,
      pan: settings.pan,
      address: settings.address,
      city: settings.city,
      pincode: settings.pincode,
      stateName: settings.stateName,
      stateCode: settings.stateCode,
      phone: settings.phone,
      email: settings.email,
      bankName: settings.bankName,
      accountNo: settings.accountNo,
      ifsc: settings.ifsc,
      branch: settings.branch,
      gstEnv: 'SANDBOX',
      integrationMode: settings.integrationMode === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX',
      shortageMode: current.shortageMode,
      bardanaMode: current.bardanaMode,
      bardanaRate: current.bardanaRate,
      irpClientId: settings.irpClientId.trim(),
      irpUsername: settings.irpUsername.trim(),
      ewbClientId: settings.ewbClientId.trim(),
      ewbUsername: settings.ewbUsername.trim(),
      irpClientSecret: secrets.irpClientSecret.trim(),
      irpPassword: secrets.irpPassword.trim(),
      irpPublicKey: secrets.irpPublicKey.trim(),
      ewbClientSecret: secrets.ewbClientSecret.trim(),
      ewbPassword: secrets.ewbPassword.trim(),
      ewbPublicKey: secrets.ewbPublicKey.trim(),
    },
  })
}

export async function requestSandboxPortal(kind: 'einvoice' | 'eway', invoice: Invoice, settings: Settings, customers: Buyer[]) {
  const buyer = customers.find((row) => row.id === invoice.buyerId)
  if (!buyer) throw new Error('Select a buyer before sending the bill to the sandbox.')
  await pushSandboxCompany(settings, {
    irpClientSecret: '',
    irpPassword: '',
    irpPublicKey: '',
    ewbClientSecret: '',
    ewbPassword: '',
    ewbPublicKey: '',
  })
  const customerId = await ensureCustomer(buyer)
  for (const line of invoice.lines) {
    await ensureHsn(line.hsn, line.description, money(String(line.gstRate)))
  }
  const saved = await ensureInvoice(invoice, customerId)
  if (saved.status === 'DRAFT') await request(`/api/invoices/${saved.id}/finalise`, { method: 'POST', body: {} })
  const record = await request<PortalRecord>(`/api/invoices/${saved.id}/${kind}`, { method: 'POST', body: { retry: true } })
  return { serverInvoiceId: saved.id, portal: toPortal(record) }
}

function toPortal(record: PortalRecord): PortalResult {
  const irn = acceptedIrn(record.irn ?? '')
  return {
    ...emptyPortal(),
    status: portalStatus(record.status),
    message: record.portalMessage || '',
    irn,
    ackNo: irn ? text(record.ackNo) : '',
    ackDate: irn ? text(record.ackDate) : '',
    ewayNo: text(record.ewayNo),
    validUpto: text(record.validUpto),
    generatedAt: text(record.generatedAt),
    signedQr: irn ? text(record.signedQr) : '',
  }
}

function portalStatus(value: string | undefined): PortalStatus {
  if (value === 'MOCK' || value === 'NOT_APPLICABLE' || value === 'NOT_SENT' || value === 'FAILED' || value === 'GENERATED' || value === 'PENDING' || value === 'CANCELLED') return value
  return 'ERROR'
}

async function ensureCustomer(buyer: Buyer) {
  const rows = await request<CustomerRow[]>('/api/customers')
  const existing = rows.find((row) => (row.gstin || '').toUpperCase() === buyer.gstin.toUpperCase())
    ?? rows.find((row) => row.name.toLowerCase() === buyer.name.toLowerCase())
  const body = {
    name: buyer.name,
    address: buyer.address,
    city: buyer.city,
    pincode: buyer.pincode,
    gstin: buyer.gstin,
    stateName: buyer.stateName,
    stateCode: buyer.stateCode,
    mobile: '',
    email: '',
    openingBalance: '0.00',
    creditLimit: '0.00',
    paymentTerms: '',
    active: true,
  }
  if (existing) return existing.id
  const created = await request<CustomerRow>('/api/customers', { method: 'POST', body })
  return created.id
}

async function ensureHsn(code: string, description: string, gstRate: string) {
  const rows = await request<HsnRow[]>('/api/hsn')
  if (rows.some((row) => row.code === code)) return
  try {
    await request('/api/hsn', { method: 'POST', body: { code, description: description.trim() || code, gstRate } })
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('already')) return
    throw error
  }
}

async function ensureInvoice(invoice: Invoice, customerId: number) {
  const body = invoiceBody(invoice, customerId)
  if (invoice.serverInvoiceId) {
    try {
      const existing = await request<InvoiceRow>(`/api/invoices/${invoice.serverInvoiceId}`)
      if (existing.status !== 'DRAFT') return existing
      return request<InvoiceRow>(`/api/invoices/${existing.id}`, { method: 'PUT', body })
    } catch {
      // The saved server id is gone. Create the bill again.
    }
  }
  try {
    return await request<InvoiceRow>('/api/invoices', { method: 'POST', body })
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes('already used')) throw error
    const rows = await request<InvoiceRow[]>(`/api/invoices?search=${encodeURIComponent(invoice.number)}`)
    const match = rows.find((row) => row.number === invoice.number)
    if (!match) throw error
    return match
  }
}

function invoiceBody(invoice: Invoice, customerId: number) {
  const distance = Number(invoice.distanceKm || '0')
  return {
    number: invoice.number,
    invoiceDate: invoice.date,
    customerId,
    placeOfSupply: invoice.placeOfSupply,
    lines: invoice.lines.map((line) => ({
      description: line.description,
      hsnCode: line.hsn,
      bags: '0.00',
      quantity: qty(line.quantity),
      quantityUnit: line.quantityUnit,
      rate: money(line.rate),
      rateUnit: line.rateUnit,
      discount: money(line.discount || '0'),
      shortageQty: '0.000',
      bardanaAmount: '0.00',
    })),
    transporterName: invoice.transporterName,
    transporterGstId: invoice.transporterId,
    vehicleNo: invoice.vehicleNo,
    transportMode: invoice.transportMode,
    distanceKm: Number.isFinite(distance) ? Math.round(distance) : 0,
    lrNumber: '',
  }
}

function money(value: string) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function qty(value: string) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(3) : '0.000'
}

function text(value: string | null | undefined) {
  return (value || '').trim()
}

async function ensureSession() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    let me: Response
    try {
      me = await fetch(apiUrl('/api/auth/me'), { headers: { Authorization: `Bearer ${token}` } })
    } catch {
      throw new Error(apiDownMessage())
    }
    if (me.ok) return
    localStorage.removeItem(TOKEN_KEY)
  }
  const data = await request<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'Admin@123' },
  })
  localStorage.setItem(TOKEN_KEY, data.token)
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.Authorization = `Bearer ${token}`
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new Error(apiDownMessage())
  }
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || 'The API request failed.')
  return data as T
}
