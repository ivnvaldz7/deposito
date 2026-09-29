import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { renderWithQueryClient as render } from '@/test-utils'
import MaterialesEmpaquePage from '../MaterialesEmpaquePage'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue([
    { id: 'p-1', productoId: 'p-1', articulo: 'PROSPECTO OLIVITASAN', cantidad: 0, stockMinimo: null, updatedAt: '2026-09-29T00:00:00.000Z' },
    { id: 'c-1', productoId: 'c-1', articulo: 'CAJA N°1', cantidad: 4, stockMinimo: 2, updatedAt: '2026-09-29T00:00:00.000Z' },
    { id: 't-1', productoId: 't-1', articulo: 'TAPA VERDE', cantidad: 8, stockMinimo: 3, updatedAt: '2026-09-29T00:00:00.000Z' },
  ]), patch: vi.fn() },
  ApiError: class ApiError extends Error {},
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn((selector?: (state: unknown) => unknown) => selector ? selector({ user: null }) : { user: null }) }))

describe('MaterialesEmpaquePage', () => {
  it('separa prospectos, cajas y tapas en la hoja propia', async () => {
    render(<MemoryRouter><MaterialesEmpaquePage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Material auxiliar de empaque' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Prospectos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cajas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tapas' })).toBeInTheDocument()
    expect(screen.getAllByText('PROSPECTO OLIVITASAN').length).toBeGreaterThan(0)
    expect(screen.getAllByText('CAJA N°1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('TAPA VERDE').length).toBeGreaterThan(0)
  })
})
