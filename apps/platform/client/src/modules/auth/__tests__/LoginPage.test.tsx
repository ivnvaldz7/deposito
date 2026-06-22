import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../LoginPage'

describe('LoginPage', () => {
  beforeEach(() => {
    // Mock window.location.href
    Object.defineProperty(window, 'location', {
      value: { href: '', assign: vi.fn() },
      writable: true,
    })
  })

  it('renders the login title', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Plataforma')).toBeInTheDocument()
  })

  it('renders a login button with Google text', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    const button = screen.getByRole('button', { name: /google/i })
    expect(button).toBeInTheDocument()
  })

  it('redirects to /api/auth/google on button click', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const button = screen.getByRole('button', { name: /google/i })
    fireEvent.click(button)

    expect(window.location.href).toContain('/api/auth/google')
  })

  it('shows error message when error=unauthorized is in URL', () => {
    render(
      <MemoryRouter initialEntries={['/login?error=unauthorized']}>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/no autorizado/i)).toBeInTheDocument()
  })

  it('shows disabled account message when error=disabled in URL', () => {
    render(
      <MemoryRouter initialEntries={['/login?error=disabled']}>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/deshabilitada/i)).toBeInTheDocument()
  })

  it('does not show error when no error param', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
