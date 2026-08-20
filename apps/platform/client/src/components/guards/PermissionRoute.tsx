import { Navigate } from 'react-router-dom'
import type { AppPermissionKey, Permission } from '@platform/core'
import { useAuthStore } from '@/stores/auth-store'
import { can } from '@/lib/permissions'

interface PermissionRouteProps {
  app: AppPermissionKey
  permission: Permission
  children: React.ReactNode
}

/** Guards direct navigation; buttons remain convenience, never authority. */
export function PermissionRoute({ app, permission, children }: PermissionRouteProps) {
  const { token, user } = useAuthStore()

  if (!token || !user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  if (!can(user, app, permission)) return <Navigate to="/app-selector" replace />

  return <>{children}</>
}
