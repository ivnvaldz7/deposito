import { describe, expect, it } from 'vitest'
import {
  LOGISTICA_INITIAL_ROWS,
  buildTechnicalSku,
  summarizeLogisticaRows,
  unitsToBoxesAndLoose,
} from '../logistica-initial-load-data'

describe('initial logistics inventory dataset', () => {
  it('contains only the approved 47 rows and preserves totals', () => {
    const summary = summarizeLogisticaRows(LOGISTICA_INITIAL_ROWS)
    expect(summary.rows).toBe(47)
    expect(summary.products).toBe(43)
    expect(summary.positiveLots).toBe(38)
    expect(summary.zeroStockRows).toBe(9)
    expect(summary.totalStock).toBe(17_014)
  })

  it('keeps different lots for one product and omits zero-stock lots', () => {
    const amantina = LOGISTICA_INITIAL_ROWS.filter((row) => row.product === 'AMANTINA 500 ML')
    expect(amantina.map((row) => row.lot)).toEqual(['AM0140', 'AM0141'])
    expect(LOGISTICA_INITIAL_ROWS.filter((row) => row.total === 0)).toHaveLength(9)
  })

  it('represents the exact total using boxes and loose units', () => {
    expect(unitsToBoxesAndLoose(1_408, 20)).toEqual({ boxes: 70, loose: 8 })
    expect(unitsToBoxesAndLoose(3, 4)).toEqual({ boxes: 0, loose: 3 })
  })

  it('builds a stable product-level technical SKU independent from lot', () => {
    expect(buildTechnicalSku('AMANTINA 500 ML')).toBe(buildTechnicalSku('AMANTINA 500 ML'))
    expect(buildTechnicalSku('AMANTINA 500 ML')).not.toBe(buildTechnicalSku('AMANTINA 250 ML'))
    expect(buildTechnicalSku('AMANTINA 500 ML')).toMatch(/^LOG-[A-F0-9]{16}$/)
  })
})
