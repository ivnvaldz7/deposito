import { render, screen } from '@/test-utils'
import { describe, it, expect } from 'vitest'
import { StockIndicator, nivelStock } from '../StockIndicator'

describe('nivelStock', () => {
  it('sin cantidad pedida refleja disponibilidad', () => {
    expect(nivelStock(5)).toBe('verde')
    expect(nivelStock(0)).toBe('rojo')
  })

  it('verde cuando el remanente cubre otra cantidad igual', () => {
    expect(nivelStock(30, 15)).toBe('verde')
  })

  it('amarillo cuando queda poco después de la cantidad pedida', () => {
    expect(nivelStock(15, 15)).toBe('amarillo')
    expect(nivelStock(20, 15)).toBe('amarillo')
  })

  it('rojo cuando el disponible no alcanza', () => {
    expect(nivelStock(10, 15)).toBe('rojo')
  })
})

describe('StockIndicator', () => {
  it('muestra disponible, reservado y semáforo verde', () => {
    render(<StockIndicator disponible={500} reservado={10} cantidadPedida={15} />)
    expect(screen.getByText('Disponible 500')).toBeInTheDocument()
    expect(screen.getByText('10 en pedidos aprobados')).toBeInTheDocument()
    expect(screen.getByLabelText('Stock verde')).toBeInTheDocument()
    expect(screen.queryByText(/Faltan/)).not.toBeInTheDocument()
  })

  it('semáforo amarillo con remanente escaso', () => {
    render(<StockIndicator disponible={20} reservado={0} cantidadPedida={15} />)
    expect(screen.getByLabelText('Stock amarillo')).toBeInTheDocument()
  })

  it('semáforo rojo y muestra cuánto falta', () => {
    render(<StockIndicator disponible={10} reservado={0} cantidadPedida={15} />)
    expect(screen.getByLabelText('Stock rojo')).toBeInTheDocument()
    expect(screen.getByText('Faltan 5u')).toBeInTheDocument()
  })

  it('sin cantidad pedida muestra el semáforo de disponibilidad', () => {
    render(<StockIndicator disponible={0} reservado={10} />)
    expect(screen.getByLabelText('Stock rojo')).toBeInTheDocument()
  })
})
