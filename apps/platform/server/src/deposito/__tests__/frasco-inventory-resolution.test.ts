import { describe, expect, it } from 'vitest'
import { resolveUniqueFrascoCandidate } from '../routes/shared/frasco-inventory-resolution'

describe('Frasco inventory fallback resolution', () => {
  const rows = [
    { id: 'legacy', articulo: 'AMBAR 100 ML' },
    { id: 'canonical', articulo: '  ambar   100 ml ' },
    { id: 'other', articulo: 'GOTERO 60 ML' },
  ]

  it('returns the only normalized article candidate', () => {
    expect(resolveUniqueFrascoCandidate(' gotero 60 ml ', rows)?.id).toBe('other')
  })

  it('rejects an ambiguous normalized article and requires productoId', () => {
    expect(() => resolveUniqueFrascoCandidate('ambar 100 ml', rows)).toThrow('HTTP_409: Más de un frasco coincide; indique productoId')
  })

  it('returns null when no normalized candidate exists', () => {
    expect(resolveUniqueFrascoCandidate('sin coincidencia', rows)).toBeNull()
  })
})
