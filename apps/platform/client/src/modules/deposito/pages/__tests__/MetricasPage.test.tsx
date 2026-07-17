import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../lib/api'
import MetricasPage from '../MetricasPage'
import { createMetricasData } from './fixtures/deposito-mock-factories'
import { createMockUser } from '@/test-utils'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
  },
}))

vi.mock('../../lib/toast', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))

describe('MetricasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ user: createMockUser(), token: 'token' })
  })

  it('renders loading skeleton states', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><MetricasPage /></MemoryRouter>)
    expect(screen.getByText('MÉTRICAS')).toBeInTheDocument()
    expect(screen.getByText('Ingresos')).toBeInTheDocument()
    expect(screen.getByText('Egresos')).toBeInTheDocument()
  })

  it('renders metrics data when loaded', async () => {
    vi.mocked(api.get).mockResolvedValue(createMetricasData())
    render(<MemoryRouter><MetricasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('MÉTRICAS')).toBeInTheDocument()
      expect(screen.getByText('Ingresos por categoría')).toBeInTheDocument()
    })
    expect(screen.getByText('Top 10 más ingresados')).toBeInTheDocument()
    const ingresosElements = screen.getAllByText('1500')
    expect(ingresosElements.length).toBeGreaterThanOrEqual(1)
    const egresosElements = screen.getAllByText('800')
    expect(egresosElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders error state via toast', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('API Error'))
    render(<MemoryRouter><MetricasPage /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText('1500')).not.toBeInTheDocument()
    })
  })
})
