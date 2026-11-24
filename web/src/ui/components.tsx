import { Loader2 } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { PortalStatus } from './model'

const fieldClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500'

export function TextField({
  label, value, onChange, error, type = 'text', hint, disabled, required, autoComplete, placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  type?: string
  hint?: string
  disabled?: boolean
  required?: boolean
  autoComplete?: string
  placeholder?: string
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}{required ? <span className="text-red-700"> *</span> : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClass} ${error ? 'border-red-500' : 'border-slate-300'}`}
      />
      {error ? <p className="mt-1 text-sm text-red-700" role="alert">{error}</p> : hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function SelectField({
  label, value, onChange, options, error, disabled, required, hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  error?: string
  disabled?: boolean
  required?: boolean
  hint?: string
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}{required ? <span className="text-red-700"> *</span> : null}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClass} ${error ? 'border-red-500' : 'border-slate-300'}`}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {error ? <p className="mt-1 text-sm text-red-700" role="alert">{error}</p> : hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </div>
  )
}

const buttonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60'

const variants = {
  primary: 'bg-primary text-white hover:bg-primary-700',
  secondary: 'border border-slate-300 bg-white text-navy hover:bg-slate-50',
  ghost: 'text-primary hover:bg-blue-50',
}

export function Button({
  children, onClick, type = 'button', variant = 'primary', disabled, loading,
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: keyof typeof variants
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={`${buttonClass} ${variants[variant]}`}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  )
}

export function ButtonLink({ to, children, variant = 'primary' }: { to: string; children: ReactNode; variant?: keyof typeof variants }) {
  return <Link to={to} className={`${buttonClass} ${variants[variant]}`}>{children}</Link>
}

export function Alert({ tone, children }: { tone: 'success' | 'error' | 'warning' | 'info'; children: ReactNode }) {
  const tones = {
    success: 'border-green-200 bg-green-50 text-success',
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
  }
  return <div role="status" className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>
}

export function Badge({ tone, children }: { tone: 'neutral' | 'success' | 'warning' | 'info' | 'danger'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700',
    success: 'bg-green-50 text-success',
    warning: 'bg-amber-50 text-amber-800',
    info: 'bg-blue-50 text-primary',
    danger: 'bg-red-50 text-red-700',
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function portalTone(status: PortalStatus): 'neutral' | 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'GENERATED') return 'success'
  if (status === 'MOCK' || status === 'NOT_SENT' || status === 'PENDING') return 'warning'
  if (status === 'NOT_APPLICABLE') return 'info'
  if (status === 'ERROR' || status === 'FAILED') return 'danger'
  return 'neutral'
}

export function portalLabel(status: PortalStatus) {
  if (status === 'MOCK') return 'MOCK / TEST ONLY'
  if (status === 'NOT_APPLICABLE') return 'Not applicable'
  if (status === 'ERROR') return 'Needs attention'
  if (status === 'NOT_SENT') return 'Sandbox — not sent'
  if (status === 'FAILED') return 'Portal rejected'
  if (status === 'GENERATED') return 'Received from portal'
  if (status === 'PENDING') return 'Sending'
  if (status === 'CANCELLED') return 'Cancelled'
  return 'Not requested'
}

export function TextArea({
  label, value, onChange, hint, placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  placeholder?: string
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <textarea
        id={id}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-blue-100"
      />
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex scroll-mt-20 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-navy">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-navy">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
