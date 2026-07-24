import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DatePickerInput } from '../DatePickerInput'

describe('DatePickerInput', () => {
  const onChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Pin date to avoid flaky tests
    vi.setSystemTime(new Date('2026-07-23'))
  })

  it('renders the input with a formatted display value', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} />)
    expect(screen.getByDisplayValue('15 de Julio 2026')).toBeInTheDocument()
  })

  it('shows placeholder when no value is provided', () => {
    render(<DatePickerInput value="" onChange={onChange} />)
    expect(screen.getByPlaceholderText('Seleccioná una fecha')).toBeInTheDocument()
  })

  it('opens the calendar panel on click', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} />)
    fireEvent.click(screen.getByDisplayValue('15 de Julio 2026'))
    expect(screen.getByText('Julio 2026')).toBeInTheDocument()
  })

  it('shows day names in the calendar header', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} />)
    fireEvent.click(screen.getByDisplayValue('15 de Julio 2026'))

    // Day name headers
    const days = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa']
    for (const d of days) {
      expect(screen.getAllByText(d).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('highlights the selected date', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} />)
    fireEvent.click(screen.getByDisplayValue('15 de Julio 2026'))

    const dayButtons = screen.getAllByRole('button')
    // Find the "15" button and check its styling (selected = bg-primary)
    const day15 = dayButtons.find((btn) => btn.textContent === '15')
    expect(day15).toBeDefined()
    expect(day15!.className).toContain('bg-primary')
  })

  it('calls onChange with the new ISO date when a day is selected', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} />)
    fireEvent.click(screen.getByDisplayValue('15 de Julio 2026'))

    // Click on day 20
    const dayButtons = screen.getAllByRole('button')
    const day20 = dayButtons.find((btn) => btn.textContent === '20')
    fireEvent.click(day20!)

    expect(onChange).toHaveBeenCalledWith('2026-07-20')
  })

  it('navigates to next month and selecting a day works', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} />)
    fireEvent.click(screen.getByDisplayValue('15 de Julio 2026'))

    // Click next month
    fireEvent.click(screen.getByLabelText('Mes siguiente'))
    expect(screen.getByText('Agosto 2026')).toBeInTheDocument()

    // Click day 10
    const dayButtons = screen.getAllByRole('button')
    const day10 = dayButtons.find((btn) => btn.textContent === '10')
    fireEvent.click(day10!)

    expect(onChange).toHaveBeenCalledWith('2026-08-10')
  })

  it('navigates to previous month', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} />)
    fireEvent.click(screen.getByDisplayValue('15 de Julio 2026'))

    fireEvent.click(screen.getByLabelText('Mes anterior'))
    expect(screen.getByText('Junio 2026')).toBeInTheDocument()
  })

  it('closes the calendar when pressing Escape', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} />)
    fireEvent.click(screen.getByDisplayValue('15 de Julio 2026'))
    expect(screen.getByText('Julio 2026')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByDisplayValue('15 de Julio 2026'), { key: 'Escape' })
    expect(screen.queryByText('Julio 2026')).not.toBeInTheDocument()
  })

  it('has a "Volver a hoy" button that selects today', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} />)
    fireEvent.click(screen.getByDisplayValue('15 de Julio 2026'))

    fireEvent.click(screen.getByText('Volver a hoy'))
    expect(onChange).toHaveBeenCalledWith('2026-07-23')
  })

  it('shows "Hoy" instead of "Volver a hoy" when the selected date is today', () => {
    render(<DatePickerInput value="2026-07-23" onChange={onChange} />)
    fireEvent.click(screen.getByDisplayValue('23 de Julio 2026'))

    expect(screen.getByText('Hoy')).toBeInTheDocument()
  })

  it('forwards error message', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} error="Fecha inválida" />)
    expect(screen.getByText('Fecha inválida')).toBeInTheDocument()
  })

  it('renders with the custom id on the input', () => {
    render(<DatePickerInput value="2026-07-15" onChange={onChange} id="custom-date" />)
    expect(screen.getByDisplayValue('15 de Julio 2026')).toHaveAttribute('id', 'custom-date')
  })

  it('closes the calendar when clicking outside', () => {
    render(
      <div>
        <DatePickerInput value="2026-07-15" onChange={onChange} />
        <button type="button" data-testid="outside">Outside</button>
      </div>
    )
    fireEvent.click(screen.getByDisplayValue('15 de Julio 2026'))
    expect(screen.getByText('Julio 2026')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Julio 2026')).not.toBeInTheDocument()
  })
})
