import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/AuthStore'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuthStore()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-orange" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
