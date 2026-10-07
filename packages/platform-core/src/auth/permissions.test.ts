import { describe, it, expect } from 'vitest'
import {
  roleHasPermission,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  type AppPermissionKey
} from './permissions'
import type { JwtPayload } from './jwt'

describe('permissions', () => {
  describe('roleHasPermission', () => {
    it('returns false for unknown app', () => {
      expect(roleHasPermission('unknown', 'admin', 'dashboard.read' as any)).toBe(false)
    })

    it('returns false for unknown permission', () => {
      expect(roleHasPermission('ale-bet', 'admin', 'unknown.permission' as any)).toBe(false)
    })

    it('returns false for unknown role', () => {
      expect(roleHasPermission('ale-bet', 'unknown-role', 'dashboard.read' as any)).toBe(false)
    })

    it('validates critical Ale-Bet permissions based on review', () => {
      // encargado + clientes.create -> false
      expect(roleHasPermission('ale-bet', 'encargado', 'clientes.create')).toBe(false)
      // armador + clientes.read -> true
      expect(roleHasPermission('ale-bet', 'armador', 'clientes.read')).toBe(true)

      // vendedor
      expect(roleHasPermission('ale-bet', 'vendedor', 'stock.read')).toBe(true)
      expect(roleHasPermission('ale-bet', 'vendedor', 'stock.lots.adjust')).toBe(false)

      // admin
      expect(roleHasPermission('ale-bet', 'admin', 'stock.lots.adjust')).toBe(true)

      // observador
      expect(roleHasPermission('ale-bet', 'observador', 'dashboard.read')).toBe(true)
      expect(roleHasPermission('ale-bet', 'observador', 'pedidos.create')).toBe(false)
    })

    it('validates Deposito permissions', () => {
      // encargado
      expect(roleHasPermission('deposito', 'encargado', 'actas.create')).toBe(true)
      expect(roleHasPermission('deposito', 'encargado', 'dashboard.read')).toBe(true)

      // observador
      expect(roleHasPermission('deposito', 'observador', 'dashboard.read')).toBe(true)
      expect(roleHasPermission('deposito', 'observador', 'actas.create')).toBe(false)

      // solicitante
      expect(roleHasPermission('deposito', 'solicitante', 'ordenes.create')).toBe(true)
      expect(roleHasPermission('deposito', 'solicitante', 'ordenes.approve')).toBe(false)
    })
  })

  describe('hasPermission', () => {
    const mockUser: JwtPayload = {
      sub: 'user-1',
      email: 'test@test.com',
      name: 'Test',
      isPlatformAdmin: false,
      apps: {
        'ale-bet': { activo: true, rol: 'encargado' },
        'deposito': { activo: false, rol: 'encargado' }
      }
    }

    it('returns false if user is null', () => {
      expect(hasPermission(null, 'ale-bet', 'dashboard.read')).toBe(false)
    })

    it('does not let a platform admin bypass Ale-Bet app access or permission checks', () => {
      expect(hasPermission({ ...mockUser, isPlatformAdmin: true, apps: {} }, 'ale-bet', 'pedidos.read')).toBe(false)
      expect(hasPermission({ ...mockUser, isPlatformAdmin: true }, 'ale-bet', 'unknown.permission' as any)).toBe(false)
    })

    it('returns false if app is inactive', () => {
      expect(hasPermission(mockUser, 'deposito', 'dashboard.read')).toBe(false)
    })

    it('returns true if active app and role has permission', () => {
      expect(hasPermission(mockUser, 'ale-bet', 'stock.read')).toBe(true)
    })

    it('returns false if role does not have permission', () => {
      expect(hasPermission(mockUser, 'ale-bet', 'clientes.create')).toBe(false)
    })
  })
})
