import { describe, expect, it } from 'vitest'
import { calcularStockFrasco, descomponerTotalFrasco, obtenerUnidadesSueltas } from '../lib/frasco-stock'

describe('stock de frascos', () => {
  it('separa un total físico en cajas completas y unidades sueltas', () => {
    expect(descomponerTotalFrasco(2_450, 30)).toEqual({ unidadesPorCaja: 30, cantidadCajas: 81, unidadesSueltas: 20, total: 2_450 })
  })

  it('calcula el total sin perder unidades sueltas', () => {
    expect(calcularStockFrasco({ unidadesPorCaja: 80, cantidadCajas: 1, unidadesSueltas: 20 })).toEqual({ unidadesPorCaja: 80, cantidadCajas: 1, unidadesSueltas: 20, total: 100 })
  })

  it('rechaza unidades sueltas que formarían una caja adicional', () => {
    expect(() => calcularStockFrasco({ unidadesPorCaja: 80, cantidadCajas: 1, unidadesSueltas: 80 })).toThrow(/sueltas/i)
  })

  it('deriva el resto de una fila histórica sin campo explícito', () => {
    expect(obtenerUnidadesSueltas({ total: 100, unidadesPorCaja: 80 })).toBe(20)
  })
})
