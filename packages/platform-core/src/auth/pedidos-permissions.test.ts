import { describe, expect, it } from 'vitest'
import { roleHasPermission, hasPermission } from './permissions'
import type { JwtPayload } from './jwt'

const roles = ['admin', 'encargado', 'vendedor', 'armador', 'facturacion', 'observador'] as const
const action: Record<(typeof roles)[number], readonly [string, string]> = {
  admin: ['pedidos.dispatch', 'unknown.permission'],
  encargado: ['pedidos.prepare', 'pedidos.create'],
  vendedor: ['pedidos.create', 'pedidos.prepare'],
  armador: ['pedidos.complete_items', 'pedidos.create'],
  facturacion: ['pedidos.read', 'pedidos.create'],
  observador: ['pedidos.read', 'pedidos.create'],
}

function user(role: string, activo = true, isPlatformAdmin = false): JwtPayload {
  return { sub: 'user-1', email: 'test@example.com', name: 'Test', isPlatformAdmin, apps: { 'ale-bet': { rol: role, activo } } }
}

describe('Ale-Bet Pedidos six-role permission matrix', () => {
  it.each(roles)('%s has its allowed action and denies its forbidden action', (role) => {
    const [allowed, denied] = action[role]
    expect(roleHasPermission('ale-bet', role, allowed as never)).toBe(true)
    expect(roleHasPermission('ale-bet', role, denied as never)).toBe(false)
  })

  it('denies missing/inactive access, unknown roles and platform admins without Ale-Bet access', () => {
    const base = user('vendedor')
    expect(hasPermission({ ...base, apps: {} }, 'ale-bet', 'pedidos.read')).toBe(false)
    expect(hasPermission(user('vendedor', false), 'ale-bet', 'pedidos.read')).toBe(false)
    expect(hasPermission(user('unknown-role'), 'ale-bet', 'pedidos.read')).toBe(false)
    expect(hasPermission({ ...base, isPlatformAdmin: true, apps: {} }, 'ale-bet', 'pedidos.read')).toBe(false)
  })
})
