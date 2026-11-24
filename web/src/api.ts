import axios from 'axios'

export const api = axios.create()

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('galla.token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string } | undefined
    return data?.error ?? 'The request could not be completed'
  }
  return 'The request could not be completed'
}

export function inr(value: string | number) {
  const amount = Number(value)
  if (Number.isNaN(amount)) return String(value)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount)
}

export type Company = {
  legalName: string
  tradeName: string
  gstin: string
  pan: string | null
  address: string
  city: string
  pincode: string
  stateName: string
  stateCode: string
  phone: string | null
  email: string | null
  bankName: string | null
  accountNo: string | null
  ifsc: string | null
  branch: string | null
  gstEnv: 'SANDBOX' | 'PRODUCTION'
  integrationMode: 'MOCK' | 'SANDBOX' | 'PRODUCTION'
  shortageMode: 'NONE' | 'QUANTITY' | 'AMOUNT'
  bardanaMode: 'NONE' | 'PER_BAG' | 'FLAT'
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

export type Customer = {
  id: number
  name: string
  address: string
  city: string
  pincode: string
  gstin: string | null
  stateName: string
  stateCode: string
  mobile: string | null
  email: string | null
  openingBalance: string
  creditLimit: string
  paymentTerms: string | null
  active: boolean
}

export type Hsn = { id: number; code: string; description: string; gstRate: string }

export type Product = {
  id: number
  name: string
  unit: string
  gstRate: string
  active: boolean
  hsn: Hsn | null
}

export type Summary = {
  companyName: string
  gstin: string
  gstEnv: string
  integrationMode: string
  customers: number
  products: number
  hsnCodes: number
  invoices: number
}
