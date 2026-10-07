import type { AppId } from './api'

/**
 * Client-side mirror of the shared role catalog (RBAC-LOG-01 — ADMIN-UI-1/2).
 *
 * Mirrors packages/platform-core/src/users/roles.ts for the two apps managed
 * in this admin UI. Both AppAccessPanel and UserModal import from here so
 * intra-client role drift is impossible. Server-side validation remains the
 * enforcement point; this only drives the selects.
 */
export const APP_ROLES: Record<AppId, readonly string[]> = {
  deposito: ['encargado', 'observador', 'solicitante'],
  ale_bet: ['admin', 'vendedor', 'armador', 'facturacion', 'observador', 'encargado'],
}
