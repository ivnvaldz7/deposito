/**
 * Shared role catalog (RBAC-LOG-01 — ADMIN-ROLES-1).
 *
 * Source of truth for which roles are valid per app. Must mirror the
 * requireApp/requireRole unions used across the server routes. The server
 * test suite pins these exact arrays (roles-catalog.test.ts, no mock), so
 * any drift breaks CI first.
 */
export type AppRoleKey = 'deposito' | 'ale_bet' | 'admin' | 'portal'

export const APP_ROLES: Record<AppRoleKey, readonly string[]> = {
  deposito: ['encargado', 'observador', 'solicitante'],
  ale_bet: ['admin', 'vendedor', 'armador', 'facturacion', 'observador', 'encargado'],
  admin: ['admin'],
  portal: ['viewer'],
}

export function isValidAppRole(app: string, rol: string): boolean {
  const roles = APP_ROLES[app as AppRoleKey]
  return roles !== undefined && roles.includes(rol)
}
