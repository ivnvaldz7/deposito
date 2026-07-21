import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from '../Select'

const defaultOptions = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
]

describe('Select', () => {
  it('renders all options', () => {
    render(<Select options={defaultOptions} value="" onChange={() => {}} />)
    expect(screen.getByText('Option 1')).toBeInTheDocument()
    expect(screen.getByText('Option 2')).toBeInTheDocument()
    expect(screen.getByText('Option 3')).toBeInTheDocument()
  })

  it('shows label when provided', () => {
    render(<Select label="Category" options={defaultOptions} value="" onChange={() => {}} />)
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByLabelText('Category')).toBeInTheDocument()
  })

  it('shows error message when error prop is set', () => {
    render(
      <Select
        options={defaultOptions}
        value=""
        onChange={() => {}}
        error="Please select an option"
      />,
    )
    expect(screen.getByText('Please select an option')).toBeInTheDocument()
  })

  it('calls onChange when option is selected', () => {
    const handleChange = vi.fn()
    render(<Select options={defaultOptions} value="" onChange={handleChange} />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'option2' } })
    expect(handleChange).toHaveBeenCalledWith('option2')
  })

  it('shows placeholder when no value matches', () => {
    render(
      <Select
        options={defaultOptions}
        value=""
        onChange={() => {}}
        placeholder="Choose..."
      />,
    )
    expect(screen.getByText('Choose...')).toBeInTheDocument()
  })

  it('disabled select does not fire onChange', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(
      <Select
        options={defaultOptions}
        value="option1"
        onChange={handleChange}
        disabled
      />,
    )
    const select = screen.getByRole('combobox')
    expect(select).toBeDisabled()
    await user.selectOptions(select, 'option2')
    expect(handleChange).not.toHaveBeenCalled()
  })
})
