import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InlineNumberEditor } from '../inline-number-editor'

describe('InlineNumberEditor', () => {
  it('saves with Enter and disables controls while saving', async () => {
    let resolveSave: (() => void) | undefined
    const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve }))
    const user = userEvent.setup()
    render(<InlineNumberEditor value={20} label="Cajas" onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Editar Cajas' }))
    const input = screen.getByRole('spinbutton', { name: 'Cajas' })
    await user.clear(input)
    await user.type(input, '34{Enter}')

    expect(onSave).toHaveBeenCalledWith(34)
    expect(input).toBeDisabled()
    resolveSave?.()
    await waitFor(() => expect(screen.queryByRole('spinbutton', { name: 'Cajas' })).not.toBeInTheDocument())
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('cancels with Escape without saving', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<InlineNumberEditor value={20} label="cantidad" onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Editar cantidad' }))
    await user.type(screen.getByRole('spinbutton', { name: 'cantidad' }), '{Escape}')

    expect(screen.queryByRole('spinbutton', { name: 'cantidad' })).not.toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('permite borrar el valor y escribir sin anteponer el cero original', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<InlineNumberEditor value={0} label="cantidad" onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Editar cantidad' }))
    const input = screen.getByRole('spinbutton', { name: 'cantidad' })
    await user.clear(input)
    expect(input).toHaveValue(null)
    await user.type(input, '200')
    expect(input).toHaveValue(200)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onSave).toHaveBeenCalledWith(200)
  })

  it('exposes accessible 36px edit, save and cancel hit targets', async () => {
    const user = userEvent.setup()
    render(<InlineNumberEditor value={20} label="cantidad" onSave={vi.fn().mockResolvedValue(undefined)} />)

    const edit = screen.getByRole('button', { name: 'Editar cantidad' })
    expect(edit).toHaveClass('size-9')
    await user.click(edit)
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveClass('size-9')
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('size-9')
  })
})
