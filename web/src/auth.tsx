import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'

type Session = { token: string; fullName: string; username: string }

type AuthContextValue = {
  session: Session | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = localStorage.getItem('galla.session')
    return raw ? (JSON.parse(raw) as Session) : null
  })

  const value = useMemo<AuthContextValue>(() => ({
    session,
    async login(username, password) {
      const response = await api.post('/api/auth/login', { username, password })
      const next = { token: response.data.token as string, fullName: response.data.user.fullName as string, username: response.data.user.username as string }
      localStorage.setItem('galla.token', next.token)
      localStorage.setItem('galla.session', JSON.stringify(next))
      setSession(next)
    },
    logout() {
      localStorage.removeItem('galla.token')
      localStorage.removeItem('galla.session')
      setSession(null)
    },
  }), [session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is missing')
  return value
}
