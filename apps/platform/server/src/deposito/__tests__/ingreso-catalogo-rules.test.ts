import { describe, expect, it } from 'vitest'
import { validateIngresoCatalogo } from '../services/ingreso-catalogo-rules'

describe('ingreso catalog rules', () => {
  it('requires an explicit enabled market for labels and boxes', () => {
    expect(() => validateIngresoCatalogo({ categoria: 'etiqueta', estado: 'ACTIVO', mercadosHabilitados: ['argentina'], mercado: undefined, cantidad: 1 })).toThrow('mercado')
    expect(() => validateIngresoCatalogo({ categoria: 'estuche', estado: 'ACTIVO', mercadosHabilitados: ['argentina'], mercado: 'VENEZUELA', cantidad: 1 })).toThrow('habilitado')
  })

  it('requires lote and vencimiento for materia prima physical ingress', () => {
    expect(() => validateIngresoCatalogo({ categoria: 'droga', estado: 'ACTIVO', mercadosHabilitados: [], cantidad: 1, lote: 'L-1' })).toThrow('vencimiento')
    expect(() => validateIngresoCatalogo({ categoria: 'droga', estado: 'ACTIVO', mercadosHabilitados: [], cantidad: 1, vencimiento: '2027-01-01' })).toThrow('lote')
  })

  it('rejects inactive products and market for jars and drugs', () => {
    expect(() => validateIngresoCatalogo({ categoria: 'frasco', estado: 'INACTIVO', mercadosHabilitados: [], cantidadCajas: 1, unidadesPorCaja: 12 })).toThrow('activo')
    expect(() => validateIngresoCatalogo({ categoria: 'droga', estado: 'ACTIVO', mercadosHabilitados: [], mercado: 'argentina', cantidad: 1, lote: 'L-1' })).toThrow('mercado')
  })
})
