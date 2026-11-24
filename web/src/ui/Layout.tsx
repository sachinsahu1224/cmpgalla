import { FilePlus2, Files, FolderDown, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings, Truck, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useBilling } from './store'

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices/new', label: 'Create invoice', icon: FilePlus2, end: false },
  { to: '/invoices', label: 'Invoice history', icon: Files, end: true },
  { to: '/customers', label: 'Customers', icon: Users, end: true },
  { to: '/products', label: 'Products', icon: Package, end: true },
  { to: '/einvoice', label: 'e-Invoice', icon: Receipt, end: false },
  { to: '/eway', label: 'E-Way bill', icon: Truck, end: false },
  { to: '/documents', label: 'Documents', icon: FolderDown, end: false },
  { to: '/settings', label: 'Company & API', icon: Settings, end: false },
]

export function Layout() {
  const { settings, session, logout } = useBilling()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const crumbs = breadcrumbs(pathname)

  return (
    <div className="min-h-screen bg-page font-sans text-slate-900">
      {open ? <button className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy text-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary text-sm font-bold">AT</div>
          <div>
            <p className="text-sm font-semibold leading-tight">Abhishek Traders</p>
            <p className="text-xs text-slate-300">Rahatgarh · GST billing</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {links.map((link) => {
            const Icon = link.icon
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5'}`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-300">
          <p>{settings.gstin}</p>
          <p className="mt-1 text-amber-200">{settings.integrationMode === 'SANDBOX' ? 'SANDBOX' : settings.integrationMode === 'PRODUCTION' ? 'PRODUCTION OFF' : 'MOCK / TEST ONLY'}</p>
          <a className="mt-3 inline-block rounded-md bg-white p-1.5" href="https://cmpsoftware.in/" target="_blank" rel="noreferrer">
            <img src="/cmp-logo.png?v=4" alt="CMP Software" className="h-auto w-full" />
          </a>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
          <button className="grid h-10 w-10 place-items-center rounded-md text-navy hover:bg-slate-100 lg:hidden" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1 text-sm text-slate-500">
            {crumbs.map((crumb, index) => (
              <span key={crumb.to}>
                {index > 0 ? <span className="px-1.5">/</span> : null}
                {index === crumbs.length - 1 ? <span className="font-medium text-navy">{crumb.label}</span> : <Link to={crumb.to} className="hover:text-primary">{crumb.label}</Link>}
              </span>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-slate-700 sm:inline">{session?.name}</span>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>
        <main className="px-4 py-5 md:px-6 md:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function breadcrumbs(pathname: string) {
  if (pathname === '/') return [{ to: '/', label: 'Dashboard' }]
  if (pathname === '/invoices/new') return [{ to: '/', label: 'Dashboard' }, { to: '/invoices', label: 'Invoices' }, { to: pathname, label: 'Create invoice' }]
  if (pathname === '/invoices') return [{ to: '/', label: 'Dashboard' }, { to: '/invoices', label: 'Invoice history' }]
  if (pathname === '/customers') return [{ to: '/', label: 'Dashboard' }, { to: '/customers', label: 'Customers' }]
  if (pathname === '/products') return [{ to: '/', label: 'Dashboard' }, { to: '/products', label: 'Products' }]
  if (pathname === '/settings') return [{ to: '/', label: 'Dashboard' }, { to: '/settings', label: 'Company & API' }]
  if (pathname === '/einvoice') return [{ to: '/', label: 'Dashboard' }, { to: '/einvoice', label: 'e-Invoice' }]
  if (pathname === '/eway') return [{ to: '/', label: 'Dashboard' }, { to: '/eway', label: 'E-Way bill' }]
  if (pathname === '/documents') return [{ to: '/', label: 'Dashboard' }, { to: '/documents', label: 'Documents' }]
  const parts = pathname.split('/').filter(Boolean)
  const id = parts[1]
  const leaf = parts[2]
  const labels: Record<string, string> = { edit: 'Edit invoice', preview: 'Invoice preview', einvoice: 'e-Invoice', eway: 'E-Way bill', documents: 'Documents', print: 'Print' }
  return [
    { to: '/', label: 'Dashboard' },
    { to: '/invoices', label: 'Invoices' },
    { to: `/invoices/${id}/preview`, label: 'Invoice' },
    { to: pathname, label: labels[leaf] ?? 'Invoice' },
  ]
}
