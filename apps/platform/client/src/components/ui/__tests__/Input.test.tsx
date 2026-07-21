import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from '../Input'

describe('Input', () => {
  it('renders with placeholder text', () => {
    render(<Input value="" onChange={() => {}} placeholder="Enter name" />)
    expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument()
  })

  it('shows label when provided', () => {
    render(<Input label="Username" value="" onChange={() => {}} />)
    expect(screen.getByText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })

  it('shows error message when error prop is set', () => {
    render(<Input value="" onChange={() => {}} error="This field is required" />)
    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('calls onChange with new value', () => {
    const handleChange = vi.fn()
    render(<Input value="" onChange={handleChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'new value' } })
    expect(handleChange).toHaveBeenCalledWith('new value')
  })

  it('renders icon when icon prop has a React node', () => {
    render(
      <Input
        value=""
        onChange={() => {}}
        icon={<span data-testid="search-icon">🔍</span>}
      />,
    )
    expect(screen.getByTestId('search-icon')).toBeInTheDocument()
  })

  it('disabled input does not fire onChange', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Input value="initial" onChange={handleChange} disabled />)
    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
    await user.type(input, 'new')
    expect(handleChange).not.toHaveBeenCalled()
  })

  it('applies custom className', () => {
    const { container } = render(
      <Input value="" onChange={() => {}} className="my-wrapper-class" />,
    )
    // The className goes on the wrapper div
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('my-wrapper-class')
  })
})
