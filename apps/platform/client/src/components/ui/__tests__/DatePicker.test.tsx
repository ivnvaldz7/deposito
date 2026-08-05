import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DatePicker } from '../DatePicker'

describe('DatePicker', () => {
  it('renders placeholder when value is empty', () => {
    render(<DatePicker value="" onChange={vi.fn()} placeholder="Seleccionar" />)
    expect(screen.getByText('Seleccionar')).toBeInTheDocument()
  })

  it('renders formatted date when value is provided', () => {
    render(<DatePicker value="2026-08-05" onChange={vi.fn()} />)
    expect(screen.getByText('05/08/2026')).toBeInTheDocument()
  })

  it('opens popover when clicking trigger', () => {
    render(<DatePicker value="" onChange={vi.fn()} placeholder="Seleccionar" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('navigates months', () => {
    render(<DatePicker value="2026-08-05" onChange={vi.fn()} placeholder="Seleccionar" />)

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))

    const nextBtn = screen.getByRole('button', { name: 'Mes siguiente' })
    fireEvent.click(nextBtn)
    expect(screen.getByText('Septiembre 2026')).toBeInTheDocument()

    const prevBtn = screen.getByRole('button', { name: 'Mes anterior' })
    fireEvent.click(prevBtn)
    fireEvent.click(prevBtn)
    expect(screen.getByText('Julio 2026')).toBeInTheDocument()
  })

  it('selects a date and calls onChange', () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-08-05" onChange={onChange} aria-label="Fecha" />)

    fireEvent.click(screen.getByRole('button', { name: 'Fecha' }))

    const dayBtn = screen.getByRole('button', { name: 'Seleccionar 15 de Agosto de 2026' })
    fireEvent.click(dayBtn)

    expect(onChange).toHaveBeenCalledWith('2026-08-15')
  })

  it('clears date', () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-08-05" onChange={onChange} aria-label="Fecha" />)

    fireEvent.click(screen.getByRole('button', { name: 'Fecha' }))

    const clearBtn = screen.getByRole('button', { name: 'Borrar' })
    fireEvent.click(clearBtn)

    expect(onChange).toHaveBeenCalledWith('')
  })
})
