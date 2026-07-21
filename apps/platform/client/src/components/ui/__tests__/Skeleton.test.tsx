import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton } from '../Skeleton'

describe('Skeleton', () => {
  it('renders text variant', () => {
    const { container } = render(<Skeleton variant="text" />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('h-4')
    expect(div).toHaveClass('w-full')
    expect(div).toHaveClass('rounded')
  })

  it('renders circle variant', () => {
    const { container } = render(<Skeleton variant="circle" />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('rounded-full')
    // Default circle size
    expect(div).toHaveClass('h-10')
    expect(div).toHaveClass('w-10')
  })

  it('renders card variant', () => {
    const { container } = render(<Skeleton variant="card" />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('h-32')
    expect(div).toHaveClass('w-full')
    expect(div).toHaveClass('rounded')
  })

  it('applies custom width/height', () => {
    const { container } = render(<Skeleton variant="text" width={200} height={50} />)
    const div = container.firstChild as HTMLElement
    expect(div.style.width).toBe('200px')
    expect(div.style.height).toBe('50px')
  })

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="my-skeleton-class" />)
    const div = container.firstChild as HTMLElement
    expect(div).toHaveClass('my-skeleton-class')
  })

  it('has aria-hidden attribute', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })
})
