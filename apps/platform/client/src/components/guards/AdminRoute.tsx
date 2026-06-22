import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

interface AdminRouteProps {
  children: React.ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { token, user } = useAuthStore()

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (!user.isPlatformAdmin) {
    return <Navigate to="/app-selector" replace />
  }

  return <>{children}</>
}
