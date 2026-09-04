import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StockChip } from '../stock-chip'

describe('StockChip', () => {
  it.each([
    [120, 100, 'Normal'],
    [100, 100, 'Stock bajo'],
    [0, null, 'Sin configurar'],
  ])('usa el mínimo de catálogo para %s/%s', (cantidad, stockMinimo, label) => {
    render(<StockChip cantidad={cantidad} stockMinimo={stockMinimo} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
