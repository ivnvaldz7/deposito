import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppLayout from '../AppLayout'
import { useCommandPaletteStore } from '../../../stores/command-palette-store'
import { useSSE } from '../../../hooks/use-sse'

vi.mock('../Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }))
vi.mock('../Topbar', () => ({ Topbar: () => <div data-testid="topbar">Buscar Notificaciones Tema</div> }))
vi.mock('../command-palette/CommandPalette', () => ({ CommandPalette: () => <div data-testid="command-palette" /> }))

vi.mock('../../../stores/command-palette-store', () => ({
  useCommandPaletteStore: vi.fn(),
}))
vi.mock('../../../hooks/use-sse', () => ({ useSSE: vi.fn() }))

vi.mock('@/lib/permissions', () => ({
  can: () => true
}))

function renderAt(path: string, children: React.ReactNode = <div data-testid="content" />) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout>{children}</AppLayout>
    </MemoryRouter>
  )
}

describe('AppLayout', () => {
  const togglePaletteMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useCommandPaletteStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(togglePaletteMock)
  })

  it('renders the Topbar on /deposito/dashboard', () => {
    renderAt('/deposito/dashboard')
    expect(useSSE).toHaveBeenCalled()
    expect(screen.getByTestId('topbar')).toBeInTheDocument()
    expect(screen.getByText(/Buscar/)).toBeInTheDocument()
    expect(screen.getByText(/Notificaciones/)).toBeInTheDocument()
    expect(screen.getByText(/Tema/)).toBeInTheDocument()
  })

  it('hides the Topbar on /productos and other pages to free up space', () => {
    const paths = ['/productos', '/actas', '/drogas', '/ingresos/nueva']

    paths.forEach(path => {
      const { unmount } = renderAt(path)
      expect(screen.queryByTestId('topbar')).not.toBeInTheDocument()
      expect(screen.getByTestId('content')).toBeInTheDocument()
      unmount()
    })
  })

  it('allows Shift+K globally from Dashboard', () => {
    renderAt('/deposito/dashboard')
    fireEvent.keyDown(document, { key: 'K', shiftKey: true })
    expect(togglePaletteMock).toHaveBeenCalled()
  })

  it('allows Shift+K globally from Actas', () => {
    renderAt('/actas')
    fireEvent.keyDown(document, { key: 'K', shiftKey: true })
    expect(togglePaletteMock).toHaveBeenCalled()
  })

  it('allows Shift+K globally from Productos', () => {
    renderAt('/productos')
    fireEvent.keyDown(document, { key: 'K', shiftKey: true })
    expect(togglePaletteMock).toHaveBeenCalled()
  })

  it('ignores Shift+K when focus is inside an input', () => {
    renderAt('/productos')
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'K', shiftKey: true })
    expect(togglePaletteMock).not.toHaveBeenCalled()
    input.remove()
  })
})
