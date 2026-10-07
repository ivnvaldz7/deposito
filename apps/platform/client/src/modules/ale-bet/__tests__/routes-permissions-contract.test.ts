import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8')

const protectedRoutes = [
  ['dashboard', 'dashboard.read', 'DashboardPage'],
  ['clientes', 'clientes.read', 'ClientesPage'],
  ['historial', 'historial.read', 'HistorialPage'],
] as const

describe('Ale-Bet direct-route permission contract', () => {
  it.each(protectedRoutes)('%s is guarded by %s before mounting its page', (path, permission, page) => {
    expect(source).toContain(
      `<Route path="${path}" element={<PermissionRoute app="ale-bet" permission="${permission}"><${page} /></PermissionRoute>} />`,
    )
  })
})
