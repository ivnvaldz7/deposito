import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useProductFocus } from '../use-product-focus'

function Harness() {
  const navigate = useNavigate()
  const { isFocused, targetProps } = useProductFocus([{ id: 'row-1', productoId: 'product-1', name: 'Producto Uno' }])
  return <><button onClick={() => navigate('/deposito/drogas?productoId=product-1&focus=2')}>Refocus</button><div {...targetProps('row-1')} data-focused={isFocused('row-1')} /></>
}

describe('useProductFocus', () => {
  it('focuses, scrolls and temporarily highlights a product selected by productoId', async () => {
    vi.useFakeTimers()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { container } = render(<MemoryRouter initialEntries={['/deposito/drogas?productoId=product-1&focus=1']}><Harness /></MemoryRouter>)
    const row = container.querySelector('[data-product-focus-id]') as HTMLElement

    await vi.runAllTimersAsync()
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(document.activeElement).toBe(row)
    expect(row).toHaveAttribute('data-focused', 'true')

    row.blur()
    fireEvent.click(container.querySelector('button')!)
    await vi.runAllTimersAsync()
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
    expect(document.activeElement).toBe(row)
    vi.useRealTimers()
  })
})
