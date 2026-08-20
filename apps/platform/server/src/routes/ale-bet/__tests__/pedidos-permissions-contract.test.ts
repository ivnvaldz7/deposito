import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(__dirname, '..', 'pedidos.ts'), 'utf8')
const bindings = [
  ['get list', "router.get('/', requirePermission('ale-bet', 'pedidos.read')"],
  ['get detail', "router.get('/:id', requirePermission('ale-bet', 'pedidos.read')"],
  ['availability', "'pedidos.availability.read'"], ['create', "'pedidos.create'"],
  ['edit', "'pedidos.edit'"], ['approve', "'pedidos.approve'"], ['take', "'pedidos.take'"],
  ['complete items', "'pedidos.complete_items'"], ['prepare', "'pedidos.prepare'"],
  ['cancel', "'pedidos.cancel'"], ['confirm cancel', "'pedidos.confirm_cancel'"], ['dispatch', "'pedidos.dispatch'"],
] as const

describe('Pedidos route permission contract', () => {
  it.each(bindings)('%s is bound to its exact permission', (_, binding) => expect(source).toContain(binding))
  it('has no legacy role-gate and protects assigned-armador actions', () => {
    expect(source).not.toContain('requireApp(')
    expect(source.match(/assertAssignedArmadorOrSupervisor\(pedido, user\)/g)).toHaveLength(2)
    expect(source.match(/assertAssignedArmadorOrSupervisor\(locked, user\)/g)).toHaveLength(2)
  })

  it('allows tomar to assign an unassigned approved order to the requesting armador', () => {
    const takeRoute = source.slice(source.indexOf("router.put('/:id/tomar'"), source.indexOf("router.put('/:id/items/:itemId/completar'"))
    expect(takeRoute).not.toContain('assertAssignedArmadorOrSupervisor')
    expect(takeRoute).toContain('armadorId: user.sub')
  })
})
