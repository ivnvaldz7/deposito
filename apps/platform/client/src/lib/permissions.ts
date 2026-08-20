import { hasPermission, type AppPermissionKey, type Permission } from '@platform/core'
import { useAuth } from '../context/auth/AuthContext'

export function usePermission(app: AppPermissionKey, permission: Permission): boolean {
  const { user } = useAuth()
  return hasPermission(user, app, permission)
}

export function can(user: any, app: AppPermissionKey, permission: Permission): boolean {
  return hasPermission(user, app, permission)
}
