import { describe, expect, it } from 'vitest'
import { buildAleBetSeedPlan } from '../seed-ale-bet-data'

describe('Ale-Bet CSV seed plan', () => {
  it('derives Producto.unidadesPorCaja from CAJA and canonicalizes lots', () => {
    const plan = buildAleBetSeedPlan([
      ['PRODUCTO', 'LOTE', 'CAJA', 'CANT.', 'SUELTO', 'TOTAL'],
      ['PRODUCTO CAJA 20', 'L-20', '20', '2', '7', '47'],
      ['PRODUCTO CAJA 4', 'L-4', '4', '2', '3', '11'],
    ])

    expect(plan.productos).toEqual([
      { nombre: 'PRODUCTO CAJA 20', unidadesPorCaja: 20 },
      { nombre: 'PRODUCTO CAJA 4', unidadesPorCaja: 4 },
    ])
    expect(plan.lotes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nombre: 'PRODUCTO CAJA 20', cajas: 2, sueltos: 7, total: 47 }),
      expect.objectContaining({ nombre: 'PRODUCTO CAJA 4', cajas: 2, sueltos: 3, total: 11 }),
    ]))
  })

  it('fails closed when CAJA differs between lots of the same product', () => {
    expect(() => buildAleBetSeedPlan([
      ['PRODUCTO', 'LOTE', 'CAJA', 'CANT.', 'SUELTO', 'TOTAL'],
      ['PRODUCTO', 'L-1', '12', '1', '0', '12'],
      ['PRODUCTO', 'L-2', '24', '1', '0', '24'],
    ])).toThrow('CAJA inconsistente')
  })

  it('fails closed when TOTAL does not match the source quantities', () => {
    expect(() => buildAleBetSeedPlan([
      ['PRODUCTO', 'LOTE', 'CAJA', 'CANT.', 'SUELTO', 'TOTAL'],
      ['PRODUCTO', 'L-1', '20', '2', '7', '48'],
    ])).toThrow('TOTAL inconsistente')
  })
})
