import { gstPaise, inWords, lineTaxPaise, toMilli, toPaise } from './money'

export type Unit = 'KG' | 'QTL'
export type TransportMode = 'ROAD' | 'RAIL' | 'AIR' | 'SHIP'
export type InvoiceStatus = 'DRAFT' | 'CONFIRMED'
export type PortalStatus = 'NOT_REQUESTED' | 'MOCK' | 'NOT_APPLICABLE' | 'ERROR' | 'NOT_SENT' | 'FAILED' | 'GENERATED' | 'PENDING' | 'CANCELLED'
export type IntegrationMode = 'MOCK' | 'SANDBOX' | 'PRODUCTION'

export type PortalResult = {
  status: PortalStatus
  message: string
  irn: string
  ackNo: string
  ackDate: string
  ewayNo: string
  validUpto: string
  generatedAt: string
  signedQr: string
}

export type Party = {
  legalName: string
  tradeName: string
  gstin: string
  pan: string
  address: string
  city: string
  stateName: string
  stateCode: string
  pincode: string
  phone: string
  email: string
  bankName: string
  accountNo: string
  ifsc: string
  branch: string
  logoDataUrl: string
}

export type Settings = Party & {
  integrationMode: IntegrationMode
  irpClientId: string
  irpUsername: string
  ewbClientId: string
  ewbUsername: string
  irpClientSecretSet: boolean
  irpPasswordSet: boolean
  irpPublicKeySet: boolean
  ewbClientSecretSet: boolean
  ewbPasswordSet: boolean
  ewbPublicKeySet: boolean
}

export type SandboxSecrets = {
  irpClientSecret: string
  irpPassword: string
  irpPublicKey: string
  ewbClientSecret: string
  ewbPassword: string
  ewbPublicKey: string
}

export type Buyer = {
  id: string
  name: string
  gstin: string
  address: string
  city: string
  stateName: string
  stateCode: string
  pincode: string
}

export type Product = {
  id: string
  name: string
  hsn: string
  gstRate: number
}

export type InvoiceLine = {
  id: string
  description: string
  hsn: string
  gstRate: number
  quantity: string
  quantityUnit: Unit
  rate: string
  rateUnit: Unit
  discount: string
}

export type Invoice = {
  id: string
  number: string
  tokenNo: string
  date: string
  buyerId: string
  placeOfSupply: string
  lines: InvoiceLine[]
  bardanaBags: string
  additionalCharges: string
  transporterName: string
  transporterId: string
  vehicleNo: string
  distanceKm: string
  transportMode: TransportMode
  status: InvoiceStatus
  seller: Party | null
  serverInvoiceId: number | null
  einvoice: PortalResult
  eway: PortalResult
}

export type PricedLine = InvoiceLine & {
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
}

export type PricedInvoice = {
  intra: boolean
  lines: PricedLine[]
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  additionalPaise: number
  roundOffPaise: number
  totalPaise: number
  words: string
}

export const defaultBuyers: Buyer[] = [
  {
    id: 'keshar',
    name: 'KESHAR ENTERPRISE',
    gstin: '23CDGPR7584H1Z3',
    address: '1 new galla mandi, Basoda',
    city: 'Vidisha',
    stateName: 'Madhya Pradesh',
    stateCode: '23',
    pincode: '464221',
  },
  {
    id: 'jk',
    name: 'JK TRADERS',
    gstin: '23DUPPR1827A1ZQ',
    address: 'Ganibasoda',
    city: 'Ganj Basoda',
    stateName: 'Madhya Pradesh',
    stateCode: '23',
    pincode: '464221',
  },
]

export const defaultProducts: Product[] = [
  { id: 'soyabeen', name: 'Soyabeen', hsn: '12019000', gstRate: 5 },
  { id: 'makka', name: 'Makka', hsn: '10059000', gstRate: 0 },
  { id: 'wheat', name: 'Wheat', hsn: '10019910', gstRate: 0 },
  { id: 'rice', name: 'Rice', hsn: '10063010', gstRate: 5 },
  { id: 'mustard', name: 'Mustard', hsn: '12075090', gstRate: 5 },
]

export const defaultSettings: Settings = {
  legalName: 'Abhishek Traders',
  tradeName: 'Abhishek Traders',
  gstin: '23AXQPJ6375E1Z9',
  pan: 'AXQPJ6375E',
  address: 'Vidisha Tiraha, Rahatgarh, Distt. Sagar (M.P.)',
  city: 'Rahatgarh',
  stateName: 'Madhya Pradesh',
  stateCode: '23',
  pincode: '470119',
  phone: '8269129464, 9300073913',
  email: '',
  bankName: 'Central Bank of India',
  accountNo: '3803390687',
  ifsc: 'CBIN0281891',
  branch: 'Rahatgarh',
  logoDataUrl: '',
  integrationMode: 'SANDBOX',
  irpClientId: '',
  irpUsername: '',
  ewbClientId: '',
  ewbUsername: '',
  irpClientSecretSet: false,
  irpPasswordSet: false,
  irpPublicKeySet: false,
  ewbClientSecretSet: false,
  ewbPasswordSet: false,
  ewbPublicKeySet: false,
}

export const emptySecrets: SandboxSecrets = {
  irpClientSecret: '',
  irpPassword: '',
  irpPublicKey: '',
  ewbClientSecret: '',
  ewbPassword: '',
  ewbPublicKey: '',
}

export function emptyPortal(): PortalResult {
  return { status: 'NOT_REQUESTED', message: '', irn: '', ackNo: '', ackDate: '', ewayNo: '', validUpto: '', generatedAt: '', signedQr: '' }
}

export function acceptedIrn(value: string | undefined) {
  return value && /^[0-9a-fA-F]{64}$/.test(value) ? value : ''
}

export function blankLine(): InvoiceLine {
  return {
    id: crypto.randomUUID(),
    description: '',
    hsn: '',
    gstRate: 0,
    quantity: '',
    quantityUnit: 'QTL',
    rate: '',
    rateUnit: 'QTL',
    discount: '0',
  }
}

export function blankInvoice(date: string): Invoice {
  return {
    id: crypto.randomUUID(),
    number: '',
    tokenNo: '',
    date,
    buyerId: '',
    placeOfSupply: '23',
    lines: [blankLine()],
    bardanaBags: '',
    additionalCharges: '0',
    transporterName: '',
    transporterId: '',
    vehicleNo: '',
    distanceKm: '0',
    transportMode: 'ROAD',
  status: 'DRAFT',
  seller: null,
  serverInvoiceId: null,
  einvoice: emptyPortal(),
  eway: emptyPortal(),
}
}

export function seedInvoice(): Invoice {
  return {
    id: 'invoice-48',
    number: '48',
    tokenNo: 'T-48',
    date: '2025-11-23',
    buyerId: 'keshar',
    placeOfSupply: '23',
    lines: [
      {
        id: 'line-48',
        description: 'Soyabeen',
        hsn: '12019000',
        gstRate: 5,
        quantity: '313.95',
        quantityUnit: 'QTL',
        rate: '4507',
        rateUnit: 'QTL',
        discount: '0',
      },
    ],
    bardanaBags: '350',
    additionalCharges: '0',
    transporterName: '',
    transporterId: '',
    vehicleNo: 'RJ09GC7788',
    distanceKm: '67',
  transportMode: 'ROAD',
  status: 'CONFIRMED',
  seller: partyOf(defaultSettings),
  serverInvoiceId: null,
  einvoice: emptyPortal(),
  eway: emptyPortal(),
}
}

export function partyOf(settings: Settings): Party {
  return {
    legalName: settings.legalName,
    tradeName: settings.tradeName,
    gstin: settings.gstin,
    pan: settings.pan,
    address: settings.address,
    city: settings.city,
    stateName: settings.stateName,
    stateCode: settings.stateCode,
    pincode: settings.pincode,
    phone: settings.phone,
    email: settings.email,
    bankName: settings.bankName,
    accountNo: settings.accountNo,
    ifsc: settings.ifsc,
    branch: settings.branch,
    logoDataUrl: settings.logoDataUrl,
  }
}

export function buyerById(customers: Buyer[], id: string) {
  return customers.find((buyer) => buyer.id === id) ?? null
}

export function hsnRate(productList: Product[], code: string) {
  return productList.find((product) => product.hsn === code)?.gstRate
}

function billedMilli(line: InvoiceLine) {
  const milli = toMilli(line.quantity)
  if (line.quantityUnit === line.rateUnit) return milli
  if (line.quantityUnit === 'KG' && line.rateUnit === 'QTL') return Math.round(milli / 100)
  return milli * 100
}

export function priceInvoice(invoice: Invoice, sellerState: string): PricedInvoice {
  const intra = invoice.placeOfSupply === sellerState
  const lines = invoice.lines.map((line) => {
    const gross = lineTaxPaise(billedMilli(line), toPaise(line.rate))
    const taxablePaise = Math.max(0, gross - toPaise(line.discount || '0'))
    const tax = gstPaise(taxablePaise, Number(line.gstRate) || 0, intra)
    return { ...line, taxablePaise, cgstPaise: tax.cgst, sgstPaise: tax.sgst, igstPaise: tax.igst }
  })
  const taxablePaise = lines.reduce((sum, line) => sum + line.taxablePaise, 0)
  const cgstPaise = lines.reduce((sum, line) => sum + line.cgstPaise, 0)
  const sgstPaise = lines.reduce((sum, line) => sum + line.sgstPaise, 0)
  const igstPaise = lines.reduce((sum, line) => sum + line.igstPaise, 0)
  const additionalPaise = Math.max(0, toPaise(invoice.additionalCharges || '0'))
  const exact = taxablePaise + cgstPaise + sgstPaise + igstPaise + additionalPaise
  const totalPaise = Math.round(exact / 100) * 100
  return {
    intra,
    lines,
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    additionalPaise,
    roundOffPaise: totalPaise - exact,
    totalPaise,
    words: inWords(Math.round(totalPaise / 100)),
  }
}

export function validateInvoice(invoice: Invoice, numbers: { id: string; number: string }[]): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!invoice.buyerId) errors.buyerId = 'Select a buyer.'
  if (!invoice.date) errors.date = 'Enter the invoice date.'
  if (!/^\d{2}$/.test(invoice.placeOfSupply)) errors.placeOfSupply = 'Use the 2-digit state code.'
  if (invoice.number && !/^[A-Za-z0-9][A-Za-z0-9/-]{0,15}$/.test(invoice.number)) {
    errors.number = 'Use up to 16 letters, digits, / or -.'
  }
  if (invoice.number && numbers.some((row) => row.id !== invoice.id && row.number.toLowerCase() === invoice.number.toLowerCase())) {
    errors.number = 'That invoice number is already used.'
  }
  if (invoice.distanceKm && (Number(invoice.distanceKm) < 0 || Number(invoice.distanceKm) > 4000 || Number.isNaN(Number(invoice.distanceKm)))) {
    errors.distanceKm = 'Distance must be from 0 to 4000 km.'
  }
  if (invoice.vehicleNo && !/^[A-Za-z0-9]{7,15}$/.test(invoice.vehicleNo)) {
    errors.vehicleNo = 'Vehicle number should be 7 to 15 letters or digits.'
  }
  if (!invoice.lines.length) errors.lines = 'Add at least one item.'
  for (const line of invoice.lines) {
    if (!line.description.trim()) errors[`${line.id}-description`] = 'Enter the product.'
    if (!/^\d{4}(\d{2}){0,2}$/.test(line.hsn)) errors[`${line.id}-hsn`] = 'HSN must be 4, 6, or 8 digits.'
    if (toMilli(line.quantity) <= 0) errors[`${line.id}-quantity`] = 'Enter a quantity above zero.'
    if (line.rate.trim() === '' || toPaise(line.rate) < 0) errors[`${line.id}-rate`] = 'Enter the rate.'
  }
  return errors
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export function validateSeller(party: Party): string[] {
  const errors: string[] = []
  if (!party.tradeName.trim()) errors.push('Company name is required.')
  if (!GSTIN.test(party.gstin)) errors.push('Seller GSTIN is not in GSTIN form.')
  if (!party.address.trim()) errors.push('Seller address is required.')
  if (!/^\d{6}$/.test(party.pincode)) errors.push('Seller PIN code must be 6 digits.')
  if (!/^\d{2}$/.test(party.stateCode)) errors.push('Seller state code is required.')
  return errors
}

export function validateBuyer(buyer: Buyer | null): string[] {
  if (!buyer) return ['Select a buyer.']
  const errors: string[] = []
  if (!GSTIN.test(buyer.gstin)) errors.push('Buyer GSTIN is not in GSTIN form.')
  if (!buyer.address.trim()) errors.push('Buyer address is required.')
  if (!/^\d{6}$/.test(buyer.pincode)) errors.push('Buyer PIN code must be 6 digits.')
  return errors
}

export function nextEinvoice(invoice: Invoice, seller: Party, buyer: Buyer | null): PortalResult {
  if (invoice.einvoice.status === 'MOCK' || invoice.einvoice.status === 'NOT_APPLICABLE') return invoice.einvoice
  const missing = [...validateSeller(seller), ...validateBuyer(buyer)]
  if (invoice.placeOfSupply !== buyer?.stateCode) missing.push('Place of supply must match the buyer state.')
  if (missing.length) return { ...emptyPortal(), status: 'ERROR', message: missing.join(' ') }
  const taxed = invoice.lines.some((line) => Number(line.gstRate) > 0)
  if (!taxed) return { ...emptyPortal(), status: 'NOT_APPLICABLE', message: 'e-Invoice is not issued for exempt goods. No IRN was created.' }
  return { ...emptyPortal(), status: 'MOCK', message: 'MOCK / TEST ONLY. No IRN, acknowledgement, or government QR was created.' }
}

export function nextEway(invoice: Invoice, totalPaise: number): PortalResult {
  if (invoice.eway.status === 'MOCK' || invoice.eway.status === 'NOT_APPLICABLE') return invoice.eway
  if (totalPaise <= 5000000) {
    return { ...emptyPortal(), status: 'NOT_APPLICABLE', message: 'MOCK / TEST ONLY. An e-way bill is not required at or below ₹50,000. No EWB number was created.' }
  }
  if (!/^[A-Za-z0-9]{7,15}$/.test(invoice.vehicleNo)) {
    return { ...emptyPortal(), status: 'ERROR', message: 'Enter a vehicle number of 7 to 15 letters or digits before requesting an e-way bill.' }
  }
  if (invoice.distanceKm === '' || Number(invoice.distanceKm) < 0 || Number(invoice.distanceKm) > 4000) {
    return { ...emptyPortal(), status: 'ERROR', message: 'Enter the distance in kilometres. Use 0 when the portal should calculate it from PIN codes.' }
  }
  return { ...emptyPortal(), status: 'MOCK', message: 'MOCK / TEST ONLY. No e-way bill number or validity was created.' }
}

export function financialYear(isoDate: string) {
  const [yearText, monthText] = isoDate.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const start = month >= 4 ? year : year - 1
  return `${start}-${String(start + 1).slice(-2)}`
}

export function suggestNumber(invoices: Invoice[], date: string) {
  const year = financialYear(date || '2026-04-01')
  const sequence = invoices.filter((invoice) => invoice.number.startsWith(`${year}/`)).length + 1
  return `${year}/${String(sequence).padStart(4, '0')}`
}
