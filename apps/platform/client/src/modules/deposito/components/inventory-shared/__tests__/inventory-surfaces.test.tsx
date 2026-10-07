import { render, screen } from '@testing-library/react'
import { Pencil } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { InventoryDataSurface, RowActionButton } from '../inventory-surfaces'

describe('inventory surfaces', () => {
  it('provides a labelled data region', () => {
    render(<InventoryDataSurface label="Inventario de estuches">contenido</InventoryDataSurface>)
    expect(screen.getByRole('region', { name: 'Inventario de estuches' })).toHaveTextContent('contenido')
  })

  it('gives icon actions an accessible name and disabled state', () => {
    render(<RowActionButton label="Editar IMIDOSAN" icon={<Pencil />} onClick={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: 'Editar IMIDOSAN' })).toBeDisabled()
  })
})
