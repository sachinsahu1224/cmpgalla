import { ArrowRight, BarChart3, Eye, EyeOff, FileText, Headphones, Loader2, Lock, Monitor, ShieldCheck, UserRound, Zap } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Alert } from '../components'
import { useBilling } from '../store'
import './LoginPage.css'

const points = [
  { icon: FileText, title: 'GST tax invoice', text: 'HSN, quantity, CGST and SGST on every grain bill.' },
  { icon: Monitor, title: 'One firm, one desk', text: 'Each trader keeps their own customers, products and bills.' },
  { icon: BarChart3, title: 'IRN and e-way', text: 'Raise, print or cancel from the portal easily.' },
]

const assurances = [
  { icon: ShieldCheck, label: 'Secure & Reliable' },
  { icon: Zap, label: 'Fast & Easy' },
  { icon: Headphones, label: 'Dedicated Support' },
]

export function LoginPage() {
  const { session, login } = useBilling()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [help, setHelp] = useState(false)
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to="/" replace />

  function submit(event: FormEvent) {
    event.preventDefault()
    const message = login(username, password)
    if (message) {
      setError(message)
      setLoading(false)
      return
    }
    setLoading(true)
  }

  return (
    <main className="galla-login">
      <section className="hero">
        <a className="brand" href="https://cmpsoftware.in/" target="_blank" rel="noreferrer">
          <img src="/images/cmp-logo-area.png" alt="CMP Software logo" />
          <div className="brand-name">
            CMP SOFTWARE
            <small>Innovate · Automate · Grow</small>
          </div>
        </a>
        <div className="kicker">CMP SOFTWARE</div>
        <h1>CMP <span>GallaBill</span></h1>
        <p className="lead">GST billing for grain mandi traders.</p>
        <p className="sublead">Sign in to the firm you work for. Its bills stay with that firm.</p>
        <div className="features">
          {points.map((point) => {
            const Icon = point.icon
            return (
              <div className="feature" key={point.title}>
                <div className="feature-icon"><Icon size={22} /></div>
                <div>
                  <b>{point.title}</b>
                  <span>{point.text}</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="hero-visual">
        <svg className="growth-arrow" viewBox="0 0 420 200" aria-hidden="true">
          <defs>
            <linearGradient id="gArrow" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="42%" stopColor="#ffffff" stopOpacity="0.72" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path fill="url(#gArrow)" d="M8 168 C 120 162, 176 128, 250 78 L 268 64 L 232 104 C 168 146, 112 168, 18 176 Z" />
          <path fill="#ffffff" d="M236 22 L 332 70 L 228 98 Z" />
        </svg>
        <img src="/images/hero-scene.png" alt="Grain sacks and a CMP GallaBill invoice on a laptop" />
      </div>

      <section className="login-side">
        <form className="login-card" onSubmit={submit} noValidate>
          <div className="user-icon"><UserRound size={30} /></div>
          <h2>Sign in</h2>
          <p className="intro">Open your firm’s billing desk.</p>
          {error ? <div className="form-error"><Alert tone="error">{error}</Alert></div> : null}
          <label className="field">
            <span className="sr-only">Username</span>
            <span className="field-icon"><UserRound size={18} /></span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Username *" required />
          </label>
          <label className="field">
            <span className="sr-only">Password</span>
            <span className="field-icon"><Lock size={18} /></span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password *"
              required
            />
            <button className="toggle" type="button" onClick={() => setShowPassword((open) => !open)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </label>
          <button className="submit" type="submit" disabled={loading}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            Sign in
          </button>
          <button className="forgot" type="button" onClick={() => setHelp((open) => !open)}>Forgot password?</button>
          {help ? <div className="form-error"><Alert tone="info">Password reset is not connected. Ask the person who set up this login.</Alert></div> : null}
          <p className="product">A product of <a href="https://cmpsoftware.in/" target="_blank" rel="noreferrer">CMP Software</a></p>
        </form>
      </section>

      <footer className="bottom">
        <ul className="assurances">
          {assurances.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.label}><Icon size={18} /> {item.label}</li>
            )
          })}
        </ul>
        <p className="disclaimer"><strong>MOCK / TEST ONLY</strong> in this demo. No government document is created here.</p>
      </footer>
    </main>
  )
}
