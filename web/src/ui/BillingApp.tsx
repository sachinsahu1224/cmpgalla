import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ButtonLink, EmptyState } from './components'
import { Layout } from './Layout'
import { CreateInvoicePage } from './pages/CreateInvoicePage'
import { CustomersPage } from './pages/CustomersPage'
import { DashboardPage } from './pages/DashboardPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { EinvoicePage } from './pages/EinvoicePage'
import { EwayPage } from './pages/EwayPage'
import { HistoryPage } from './pages/HistoryPage'
import { LoginPage } from './pages/LoginPage'
import { PreviewPage } from './pages/PreviewPage'
import { ProductsPage } from './pages/ProductsPage'
import { PrintPage } from './pages/PrintPage'
import { SettingsPage } from './pages/SettingsPage'
import { BillingProvider, useBilling } from './store'

export function BillingApp() {
  return (
    <BillingProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/invoices/:id/print" element={<PrintPage />} />
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="invoices" element={<HistoryPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="invoices/new" element={<CreateInvoicePage key="new" />} />
            <Route path="invoices/:id/edit" element={<CreateInvoicePage />} />
            <Route path="invoices/:id/preview" element={<PreviewPage />} />
            <Route path="invoices/:id/einvoice" element={<EinvoicePage />} />
            <Route path="invoices/:id/eway" element={<EwayPage />} />
            <Route path="invoices/:id/documents" element={<DocumentsPage />} />
            <Route path="einvoice" element={<LatestGate segment="einvoice" />} />
            <Route path="eway" element={<LatestGate segment="eway" />} />
            <Route path="documents" element={<LatestGate segment="documents" />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BillingProvider>
  )
}

function RequireAuth() {
  const { session } = useBilling()
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

function LatestGate({ segment }: { segment: 'einvoice' | 'eway' | 'documents' }) {
  const { invoices } = useBilling()
  const invoice = invoices.find((row) => row.status === 'CONFIRMED') ?? invoices[0]
  if (!invoice) {
    return <EmptyState title="No invoice yet" body="Create a bill before opening this step." action={<ButtonLink to="/invoices/new">Create invoice</ButtonLink>} />
  }
  return <Navigate to={`/invoices/${invoice.id}/${segment}`} replace />
}
