import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InventoryPageHeader } from '../InventoryPageHeader'
import { MercadoFilter } from '../mercado-filter'

describe('InventoryPageHeader', () => {
  it('keeps contextual opening actions out of the market filter bar', () => {
    const onChangeMercado = vi.fn()

    render(
      <InventoryPageHeader
        title="Estuches"
        stats={[]}
        secondaryActions={[{ label: 'Carga inicial', onClick: vi.fn() }]}
      >
        <MercadoFilter
          mercadoActivo="todos"
          onChangeMercado={onChangeMercado}
          totalCount={2}
          countsByMercado={{
            argentina: 1,
            colombia: 1,
            mexico: 0,
            ecuador: 0,
            bolivia: 0,
            paraguay: 0,
            VENEZUELA: 0,
            no_exportable: 0,
          }}
        />
      </InventoryPageHeader>,
    )

    const filters = within(screen.getByRole('region', { name: 'Filtros de mercado' }))
    expect(filters.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Todos',
      'Argentina',
      'Colombia',
    ])
    expect(filters.queryByRole('button', { name: 'Carga inicial' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Carga inicial' })).toBeInTheDocument()

    filters.getByRole('button', { name: 'Colombia' }).click()
    expect(onChangeMercado).toHaveBeenCalledWith('colombia')
  })
})
