import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppLayout from '../AppLayout'
import { useCommandPaletteStore } from '../../../stores/command-palette-store'

// Child components are tested on their own; here we only assert AppLayout's own
// contract: conditional Topbar and the global Shift+K handler.
vi.mock('../Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }))
vi.mock('../Topbar', () => ({ Topbar: () => <div data-testid="topbar" /> }))
vi.mock('../../command-palette/CommandPalette', () => ({ CommandPalette: () => <div data-testid="command-palette" /> }))

vi.mock('../../../stores/command-palette-store', () => ({ useCommandPaletteStore: vi.fn() }))

interface PaletteState {
  isOpen: boolean
  openPalette: ReturnType<typeof vi.fn>
  closePalette: ReturnType<typeof vi.fn>
  togglePalette: ReturnType<typeof vi.fn>
}

let paletteState: PaletteState

function setupPaletteStore() {
  paletteState = {
    isOpen: false,
    openPalette: vi.fn(),
    closePalette: vi.fn(),
    togglePalette: vi.fn(),
  }
  const mockFn = useCommandPaletteStore as unknown as ReturnType<typeof vi.fn> & { getState: () => PaletteState }
  mockFn.getState = () => paletteState
  mockFn.mockImplementation(
    (selector?: (s: PaletteState) => unknown) => (selector ? selector(paletteState) : paletteState)
  )
}

function renderAt(path: string, children: React.ReactNode = <div data-testid="content" />) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout>{children}</AppLayout>
    </MemoryRouter>
  )
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupPaletteStore()
  })

  it('hides the Topbar on /productos and keeps the rest of the layout', () => {
    renderAt('/productos')

    expect(screen.queryByTestId('topbar')).not.toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })

  it('renders the Topbar on other paths', () => {
    renderAt('/')

    expect(screen.getByTestId('topbar')).toBeInTheDocument()
  })

  it('keeps the global Shift+K handler registered on /productos', () => {
    renderAt('/productos')

    const event = new KeyboardEvent('keydown', { key: 'K', shiftKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(event)

    expect(paletteState.togglePalette).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not toggle the palette for plain K or while typing in an input', () => {
    renderAt('/productos', <input data-testid="search-input" />)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', shiftKey: true, bubbles: true }))
    expect(paletteState.togglePalette).not.toHaveBeenCalled()

    // The handler guards against firing while the target is an input
    const input = screen.getByTestId('search-input')
    const inputEvent = new KeyboardEvent('keydown', { key: 'K', shiftKey: true, bubbles: true, cancelable: true })
    input.dispatchEvent(inputEvent)
    expect(paletteState.togglePalette).not.toHaveBeenCalled()
  })
})
