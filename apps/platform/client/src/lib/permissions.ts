import { hasPermission, type AppPermissionKey, type Permission, type JwtPayload } from '@platform/core/permissions'
import { useAuthStore } from '@/stores/auth-store'

export function usePermission() {
  const user = useAuthStore((state) => state.user)
  return {
    can: (app: AppPermissionKey, permission: Permission) => hasPermission(user, app, permission)
  }
}

export function can(user: JwtPayload | null | undefined, app: AppPermissionKey, permission: Permission): boolean {
  return hasPermission(user, app, permission)
}
