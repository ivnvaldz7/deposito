import { render, screen, fireEvent } from '@/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { QuantityStepper } from '../QuantityStepper'

function Harness({
  initialCajas = 0,
  initialSueltos = 0,
  unidadesPorCaja = 15,
  showSueltos,
}: {
  initialCajas?: number
  initialSueltos?: number
  unidadesPorCaja?: number
  showSueltos?: boolean
}) {
  const [cajas, setCajas] = useState(initialCajas)
  const [sueltos, setSueltos] = useState(initialSueltos)
  const onChange = vi.fn()
  return (
    <div>
      <QuantityStepper
        cajas={cajas}
        sueltos={sueltos}
        unidadesPorCaja={unidadesPorCaja}
        showSueltos={showSueltos}
        onChange={(c, s) => {
          onChange(c, s)
          setCajas(c)
          setSueltos(s)
        }}
      />
      <span data-testid="cajas">{cajas}</span>
      <span data-testid="sueltos">{sueltos}</span>
    </div>
  )
}

describe('QuantityStepper', () => {
  it('suma y resta cajas y sueltos sin ir a negativos', () => {
    render(<Harness initialCajas={1} initialSueltos={2} />)
    expect(screen.getByText('17 unidades')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sumar cajas' }))
    expect(screen.getByTestId('cajas')).toHaveTextContent('2')
    expect(screen.getByText('32 unidades')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar sueltos' }))
    expect(screen.getByTestId('sueltos')).toHaveTextContent('1')
    expect(screen.getByText('31 unidades')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar cajas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar cajas' }))
    expect(screen.getByTestId('cajas')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: 'Quitar cajas' })).toBeDisabled()
  })

  it('edita cantidades con input numérico y valida al blur', () => {
    render(<Harness initialCajas={1} />)
    const input = screen.getByLabelText('cajas')
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.blur(input)
    expect(screen.getByTestId('cajas')).toHaveTextContent('3')
    expect(screen.getByText('45 unidades')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '-4' } })
    fireEvent.blur(input)
    expect(screen.getByTestId('cajas')).toHaveTextContent('4')
    expect(screen.getByLabelText('cajas')).toHaveValue('4')
  })

  it('clampa sueltos al máximo de la presentación (14 para caja 15)', () => {
    render(<Harness initialSueltos={14} />)
    expect(screen.getByRole('button', { name: 'Sumar sueltos' })).toBeDisabled()

    const input = screen.getByLabelText('sueltos')
    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.blur(input)
    expect(screen.getByTestId('sueltos')).toHaveTextContent('14')
    expect(screen.getByLabelText('sueltos')).toHaveValue('14')
  })

  it('acepta una presentación distinta', () => {
    render(<Harness initialSueltos={4} unidadesPorCaja={10} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sumar sueltos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sumar sueltos' }))
    expect(screen.getByTestId('sueltos')).toHaveTextContent('6')
  })

  it('puede ocultar los sueltos', () => {
    render(<QuantityStepper cajas={1} sueltos={0} unidadesPorCaja={15} showSueltos={false} onChange={vi.fn()} />)
    expect(screen.getByLabelText('cajas')).toBeInTheDocument()
    expect(screen.queryByLabelText('sueltos')).not.toBeInTheDocument()
  })
})
