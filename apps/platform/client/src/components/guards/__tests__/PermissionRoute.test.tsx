import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PermissionRoute } from '../PermissionRoute'
import { useAuthStore, type PlatformUser } from '@/stores/auth-store'

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))
const roles = ['admin', 'encargado', 'vendedor', 'armador', 'facturacion', 'observador']
function renderRoute(user: PlatformUser | null) {
  vi.mocked(useAuthStore).mockImplementation(((selector?: (state: { token: string | null; user: PlatformUser | null }) => unknown) => { const state = { token: user ? 'token' : null, user }; return selector ? selector(state) : state }) as never)
  render(<MemoryRouter initialEntries={['/ale-bet/pedidos']}><Routes><Route path="/ale-bet/pedidos" element={<PermissionRoute app="ale-bet" permission="pedidos.read"><div>Pedidos</div></PermissionRoute>} /><Route path="/app-selector" element={<div>Denied</div>} /></Routes></MemoryRouter>)
}
function user(role: string, activo = true, isPlatformAdmin = false): PlatformUser {
  return { sub: 'u-1', email: 'u@example.com', name: 'User', isPlatformAdmin, apps: { 'ale-bet': { rol: role, activo } } }
}
describe('PermissionRoute Pedidos', () => {
  it.each(roles)('allows %s to the read route', (role) => { renderRoute(user(role)); expect(screen.getByText('Pedidos')).toBeInTheDocument() })
  it('denies inactive, unknown, and platform-admin-only access', () => {
    renderRoute(user('vendedor', false)); expect(screen.getByText('Denied')).toBeInTheDocument()
  })
})
