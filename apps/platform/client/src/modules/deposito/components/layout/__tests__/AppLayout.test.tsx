import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppLayout from '../AppLayout'
import { useCommandPaletteStore } from '../../../stores/command-palette-store'
import { useSSE } from '../../../hooks/use-sse'

vi.mock('../Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }))
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

  it('keeps the same content origin on dashboard as on the other pages', () => {
    renderAt('/deposito/dashboard')
    expect(useSSE).toHaveBeenCalled()
    expect(screen.getByTestId('content')).toBeInTheDocument()
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
