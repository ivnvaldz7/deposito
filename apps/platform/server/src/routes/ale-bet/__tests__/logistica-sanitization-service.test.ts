import { describe, expect, it } from 'vitest'
import { buildSanitizationManifest } from '../logistica-sanitization-service'

describe('logistics sanitization manifest', () => {
  it('requires the exact 43 canonical identities and classifies only seeded H/I as deletable', () => {
    const manifest = buildSanitizationManifest({
      products: [
        { id: 'canonical', nombre: 'AMANTINA 250 ML', sku: 'LOG-OTHER', unidadesPorCaja: 15, lots: [], balances: [], reservations: 0, movements: 0, items: 0 },
        { id: 'h', nombre: 'DEMO Producto H', sku: 'DEMO-PRO-H', unidadesPorCaja: 20, lots: [], balances: [], reservations: 0, movements: 0, items: 0 },
        { id: 'i', nombre: 'DEMO Producto I', sku: 'DEMO-PRO-I', unidadesPorCaja: 12, lots: [], balances: [], reservations: 0, movements: 0, items: 0 },
      ],
    })

    expect(manifest.safe).toBe(false)
    expect(manifest.blockers).toContain('canonical identity mismatch: AMANTINA 250 ML')
    expect(manifest.deletableDemo.map((product) => product.sku)).toEqual(['DEMO-PRO-H', 'DEMO-PRO-I'])
    expect(manifest.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('blocks a DEMO H/I graph when it has stock or operational reachability', () => {
    const manifest = buildSanitizationManifest({
      products: [
        { id: 'h', nombre: 'DEMO Producto H', sku: 'DEMO-PRO-H', unidadesPorCaja: 20, lots: [{ id: 'lot-h', cajas: 0, sueltos: 1 }], balances: [1], reservations: 0, movements: 0, items: 0 },
      ],
    })

    expect(manifest.deletableDemo).toEqual([])
    expect(manifest.blockers).toContain('DEMO deletion unsafe: DEMO-PRO-H')
  })
})
