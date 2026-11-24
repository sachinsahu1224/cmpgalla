import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buyerById, emptyPortal, partyOf, priceInvoice, seedInvoice, suggestNumber, nextEinvoice, nextEway, defaultSettings, defaultBuyers, defaultProducts, type Buyer, type Invoice, type Product, type SandboxSecrets, type Settings } from './model'
import { applyCompanyFlags, pushSandboxCompany, requestSandboxPortal } from './sandboxApi'

const STORAGE_KEY = 'abhishek.billing.v1'

type Session = { username: string; name: string }

type Persisted = {
  session: Session | null
  settings: Settings
  customers: Buyer[]
  products: Product[]
  invoices: Invoice[]
}

type Store = Persisted & {
  login: (username: string, password: string) => string | null
  logout: () => void
  saveSettings: (settings: Settings, secrets: SandboxSecrets) => Promise<string | null>
  saveCustomer: (customer: Buyer) => string | null
  deleteCustomer: (id: string) => void
  saveProduct: (product: Product) => string | null
  deleteProduct: (id: string) => void
  saveInvoice: (invoice: Invoice) => Invoice
  deleteInvoice: (id: string) => void
  confirmInvoice: (id: string) => void
  requestEinvoice: (id: string) => Promise<void>
  requestEway: (id: string) => Promise<void>
}

const BillingContext = createContext<Store | null>(null)

function load(): Persisted {
  const fallback = { session: null, settings: defaultSettings, customers: defaultBuyers, products: defaultProducts, invoices: [seedInvoice()] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Persisted
    if (!parsed.settings?.gstin || !Array.isArray(parsed.invoices)) return fallback
    return {
      session: parsed.session ?? null,
      settings: {
        ...defaultSettings,
        ...parsed.settings,
        pan: parsed.settings.pan || defaultSettings.pan,
        integrationMode: parsed.settings.integrationMode === 'PRODUCTION' ? 'PRODUCTION' : parsed.settings.integrationMode === 'MOCK' ? 'SANDBOX' : (parsed.settings.integrationMode || 'SANDBOX'),
        irpClientId: parsed.settings.irpClientId || '',
        irpUsername: parsed.settings.irpUsername || '',
        ewbClientId: parsed.settings.ewbClientId || '',
        ewbUsername: parsed.settings.ewbUsername || '',
        irpClientSecretSet: Boolean(parsed.settings.irpClientSecretSet),
        irpPasswordSet: Boolean(parsed.settings.irpPasswordSet),
        irpPublicKeySet: Boolean(parsed.settings.irpPublicKeySet),
        ewbClientSecretSet: Boolean(parsed.settings.ewbClientSecretSet),
        ewbPasswordSet: Boolean(parsed.settings.ewbPasswordSet),
        ewbPublicKeySet: Boolean(parsed.settings.ewbPublicKeySet),
      },
      customers: parsed.customers?.length ? parsed.customers : defaultBuyers,
      products: parsed.products?.length ? parsed.products : defaultProducts,
      invoices: parsed.invoices.map((invoice) => ({
        ...invoice,
        tokenNo: invoice.tokenNo ?? (invoice.number === '48' ? 'T-48' : ''),
        bardanaBags: invoice.bardanaBags || (invoice.number === '48' ? '350' : ''),
        serverInvoiceId: invoice.serverInvoiceId ?? null,
        einvoice: { ...emptyPortal(), ...invoice.einvoice },
        eway: { ...emptyPortal(), ...invoice.eway },
      })),
    }
  } catch {
    return fallback
  }
}

export function BillingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const store = useMemo<Store>(() => ({
    ...state,
    login: (username, password) => {
      if (!username.trim() || !password) return 'Enter the username and password.'
      if (username.trim() !== 'admin' || password !== 'Admin@123') return 'Those details do not match the demo login.'
      setState((current) => ({ ...current, session: { username: 'admin', name: 'Abhishek' } }))
      return null
    },
    logout: () => setState((current) => ({ ...current, session: null })),
    saveSettings: async (settings, secrets) => {
      setState((current) => ({ ...current, settings }))
      if (settings.integrationMode === 'MOCK') return null
      try {
        const saved = await pushSandboxCompany(settings, secrets)
        setState((current) => ({ ...current, settings: applyCompanyFlags(current.settings, saved) }))
        return null
      } catch (error) {
        return error instanceof Error ? error.message : 'Sandbox settings were not saved on the server.'
      }
    },
    saveCustomer: (customer) => {
      if (!customer.name.trim()) return 'Enter the customer name.'
      const saved = { ...customer, id: customer.id || crypto.randomUUID(), name: customer.name.trim(), gstin: customer.gstin.toUpperCase() }
      setState((current) => ({
        ...current,
        customers: current.customers.some((row) => row.id === saved.id)
          ? current.customers.map((row) => row.id === saved.id ? saved : row)
          : [...current.customers, saved],
      }))
      return null
    },
    deleteCustomer: (id) => setState((current) => ({ ...current, customers: current.customers.filter((row) => row.id !== id) })),
    saveProduct: (product) => {
      if (!product.name.trim()) return 'Enter the product name.'
      if (!/^\d{4}(\d{2}){0,2}$/.test(product.hsn)) return 'HSN must be 4, 6, or 8 digits.'
      const saved = { ...product, id: product.id || crypto.randomUUID(), name: product.name.trim(), hsn: product.hsn.trim(), gstRate: Number(product.gstRate) || 0 }
      setState((current) => ({
        ...current,
        products: current.products.some((row) => row.id === saved.id)
          ? current.products.map((row) => row.id === saved.id ? saved : row)
          : [...current.products, saved],
      }))
      return null
    },
    deleteProduct: (id) => setState((current) => ({ ...current, products: current.products.filter((row) => row.id !== id) })),
    saveInvoice: (invoice) => {
      const saved = {
        ...invoice,
        seller: partyOf(state.settings),
        number: invoice.number.trim() || suggestNumber(state.invoices, invoice.date),
      }
      setState((current) => ({
        ...current,
        invoices: current.invoices.some((row) => row.id === saved.id)
          ? current.invoices.map((row) => row.id === saved.id ? saved : row)
          : [saved, ...current.invoices],
      }))
      return saved
    },
    deleteInvoice: (id) => setState((current) => ({ ...current, invoices: current.invoices.filter((row) => row.id !== id) })),
    confirmInvoice: (id) => setState((current) => ({
      ...current,
      invoices: current.invoices.map((invoice) => invoice.id === id
        ? { ...invoice, status: 'CONFIRMED', seller: invoice.seller ?? partyOf(current.settings) }
        : invoice),
    })),
    requestEinvoice: async (id) => {
      const invoice = state.invoices.find((row) => row.id === id)
      if (!invoice) return
      if (state.settings.integrationMode === 'MOCK') {
        const seller = invoice.seller ?? partyOf(state.settings)
        const einvoice = nextEinvoice(invoice, seller, buyerById(state.customers, invoice.buyerId))
        setState((current) => ({ ...current, invoices: current.invoices.map((row) => row.id === id ? { ...row, einvoice } : row) }))
        return
      }
      try {
        const outcome = await requestSandboxPortal('einvoice', invoice, state.settings, state.customers)
        setState((current) => ({
          ...current,
          invoices: current.invoices.map((row) => row.id === id ? { ...row, serverInvoiceId: outcome.serverInvoiceId, einvoice: outcome.portal } : row),
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The sandbox request failed. No IRN was stored.'
        setState((current) => ({
          ...current,
          invoices: current.invoices.map((row) => row.id === id ? { ...row, einvoice: { ...emptyPortal(), status: 'ERROR', message } } : row),
        }))
      }
    },
    requestEway: async (id) => {
      const invoice = state.invoices.find((row) => row.id === id)
      if (!invoice) return
      if (state.settings.integrationMode === 'MOCK') {
        const seller = invoice.seller ?? partyOf(state.settings)
        const eway = nextEway(invoice, priceInvoice(invoice, seller.stateCode).totalPaise)
        setState((current) => ({ ...current, invoices: current.invoices.map((row) => row.id === id ? { ...row, eway } : row) }))
        return
      }
      try {
        const outcome = await requestSandboxPortal('eway', invoice, state.settings, state.customers)
        setState((current) => ({
          ...current,
          invoices: current.invoices.map((row) => row.id === id ? { ...row, serverInvoiceId: outcome.serverInvoiceId, eway: outcome.portal } : row),
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The sandbox request failed. No e-way number was stored.'
        setState((current) => ({
          ...current,
          invoices: current.invoices.map((row) => row.id === id ? { ...row, eway: { ...emptyPortal(), status: 'ERROR', message } } : row),
        }))
      }
    },
  }), [state])

  return <BillingContext.Provider value={store}>{children}</BillingContext.Provider>
}

export function useBilling() {
  const store = useContext(BillingContext)
  if (!store) throw new Error('Billing store is missing')
  return store
}

export function useInvoice(id: string | undefined) {
  const { invoices } = useBilling()
  return invoices.find((invoice) => invoice.id === id) ?? null
}
