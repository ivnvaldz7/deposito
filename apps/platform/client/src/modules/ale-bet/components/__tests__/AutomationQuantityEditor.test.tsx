import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AutomationQuantityEditor } from '../AutomationQuantityEditor'

describe('AutomationQuantityEditor', () => {
  it('descompone visualmente y permite editar cajas y sueltos', () => {
    const onChange = vi.fn()
    
    const { rerender } = render(
      <AutomationQuantityEditor
        cajas={1}
        sueltos={0}
        unidadesPorCaja={12}
        totalUnits={12}
        originalExpression="12 unidades"
        onChange={onChange}
      />
    )
    
    expect(screen.getByText('Total: 12 unidades')).toBeInTheDocument()
    expect(screen.getByText('Pedido original: 12 unidades')).toBeInTheDocument()
    
    const plusSueltosBtn = screen.getAllByText('+')[1]
    fireEvent.click(plusSueltosBtn)
    
    expect(onChange).toHaveBeenCalledWith(1, 1) // 1 caja, 1 suelto
    
    rerender(
      <AutomationQuantityEditor
        cajas={1}
        sueltos={11}
        unidadesPorCaja={12}
        totalUnits={23}
        originalExpression="12 unidades"
        onChange={onChange}
      />
    )
    
    // Test rollover
    fireEvent.click(screen.getAllByText('+')[1])
    expect(onChange).toHaveBeenCalledWith(2, 0)
    
    // Test rollunder
    const minusSueltosBtn = screen.getAllByText('-')[1]
    rerender(
      <AutomationQuantityEditor
        cajas={2}
        sueltos={0}
        unidadesPorCaja={12}
        totalUnits={24}
        originalExpression="12 unidades"
        onChange={onChange}
      />
    )
    
    fireEvent.click(minusSueltosBtn)
    expect(onChange).toHaveBeenCalledWith(1, 11)
  })

  it('permite cambiar cajas independientemente', () => {
    const onChange = vi.fn()
    render(
      <AutomationQuantityEditor
        cajas={2}
        sueltos={2}
        unidadesPorCaja={12}
        totalUnits={26}
        originalExpression="26 unidades"
        onChange={onChange}
      />
    )
    
    const plusCajasBtn = screen.getAllByText('+')[0]
    fireEvent.click(plusCajasBtn)
    expect(onChange).toHaveBeenCalledWith(3, 2)
  })
})
