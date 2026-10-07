import { describe, expect, it } from 'vitest'
import { APP_ROLES, isValidAppRole } from '@platform/core'

/**
 * Role catalog pins (RBAC-LOG-01 — ADMIN-ROLES-1).
 *
 * Imports the REAL @platform/core module (no mock): this test is the drift
 * guard that keeps the shared catalog aligned with the requireApp/requireRole
 * unions used across routes. Any change to APP_ROLES breaks here first.
 */
describe('Role catalog (ADMIN-ROLES-1)', () => {
  it('pins the exact APP_ROLES arrays per app', () => {
    expect(APP_ROLES.deposito).toEqual(['encargado', 'observador', 'solicitante'])
    expect(APP_ROLES.ale_bet).toEqual([
      'admin',
      'vendedor',
      'armador',
      'facturacion',
      'observador',
      'encargado',
    ])
    expect(APP_ROLES.admin).toEqual(['admin'])
    expect(APP_ROLES.portal).toEqual(['viewer'])
  })

  it('accepts every role declared in the catalog', () => {
    expect(isValidAppRole('deposito', 'encargado')).toBe(true)
    expect(isValidAppRole('deposito', 'observador')).toBe(true)
    expect(isValidAppRole('deposito', 'solicitante')).toBe(true)
    expect(isValidAppRole('ale_bet', 'admin')).toBe(true)
    expect(isValidAppRole('ale_bet', 'vendedor')).toBe(true)
    expect(isValidAppRole('ale_bet', 'armador')).toBe(true)
    expect(isValidAppRole('ale_bet', 'facturacion')).toBe(true)
    expect(isValidAppRole('ale_bet', 'observador')).toBe(true)
    expect(isValidAppRole('ale_bet', 'encargado')).toBe(true)
    expect(isValidAppRole('admin', 'admin')).toBe(true)
    expect(isValidAppRole('portal', 'viewer')).toBe(true)
  })

  it('rejects stale roles and unknown apps (triangulation)', () => {
    expect(isValidAppRole('ale_bet', 'operador')).toBe(false)
    expect(isValidAppRole('ale_bet', 'supervisor')).toBe(false)
    expect(isValidAppRole('deposito', 'admin')).toBe(false)
    expect(isValidAppRole('deposito', 'vendedor')).toBe(false)
    expect(isValidAppRole('deposito', 'facturacion')).toBe(false)
    expect(isValidAppRole('unknown_app', 'encargado')).toBe(false)
  })
})
