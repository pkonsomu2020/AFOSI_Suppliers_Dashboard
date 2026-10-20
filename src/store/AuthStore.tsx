import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiGet, apiPost, ApiError } from '../lib/apiClient'

interface Session {
  user: { email: string }
}

interface AuthStoreValue {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthStoreValue | null>(null)

export function AuthStoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/auth/me')
      .then((data) => setSession(data.email ? { user: { email: data.email } } : null))
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      const data = await apiPost('/auth/login', { email, password })
      setSession({ user: { email: data.email } })
      return null
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Could not sign in — try again.'
    }
  }

  const signOut = async () => {
    await apiPost('/auth/logout').catch(() => {})
    setSession(null)
  }

  return <AuthContext.Provider value={{ session, loading, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuthStore() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthStore must be used within AuthStoreProvider')
  return ctx
}
