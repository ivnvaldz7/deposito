import { describe, expect, it } from 'vitest'
import { formatCantidad } from './format-units'

describe('formatCantidad', () => {
  it('keeps drug quantities in kilograms without converting them again', () => {
    expect(formatCantidad(80, 'droga')).toBe('80 kg')
    expect(formatCantidad(0.4, 'droga')).toBe('0.400 kg')
  })
})
