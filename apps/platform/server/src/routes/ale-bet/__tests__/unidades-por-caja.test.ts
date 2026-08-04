import { describe, expect, it } from 'vitest'
import {
  calcularUnidades,
  descomponerUnidades,
  validarSueltos,
} from '../unidades-por-caja'

describe('Ale-Bet unidades por caja', () => {
  it.each([
    [4, 2, 3, 11],
    [12, 2, 7, 31],
    [15, 2, 7, 37],
    [20, 2, 7, 47],
    [24, 2, 7, 55],
    [40, 2, 7, 87],
  ])('calcula %i unidades por caja: %i cajas + %i sueltos = %i unidades', (unidadesPorCaja, cajas, sueltos, expected) => {
    expect(calcularUnidades(cajas, sueltos, unidadesPorCaja)).toBe(expected)
  })

  it.each([4, 12, 15, 20, 24, 40])('descompone unidades usando la presentación %i', (unidadesPorCaja) => {
    const total = unidadesPorCaja * 2 + unidadesPorCaja - 1
    expect(descomponerUnidades(total, unidadesPorCaja)).toEqual({ cajas: 2, sueltos: unidadesPorCaja - 1 })
  })

  it('rechaza sueltos que alcanzan una caja', () => {
    expect(validarSueltos(3, 4)).toBe(true)
    expect(validarSueltos(4, 4)).toBe(false)
  })
})
