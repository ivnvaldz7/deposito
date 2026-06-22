import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

interface ProtectedRouteProps {
  children: React.ReactNode
  app?: string
}

export function ProtectedRoute({ children, app }: ProtectedRouteProps) {
  const { token, user } = useAuthStore()

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (app) {
    const access = user.apps?.[app]
    if (!access?.activo) {
      return <Navigate to="/app-selector" replace />
    }
  }

  return <>{children}</>
}
