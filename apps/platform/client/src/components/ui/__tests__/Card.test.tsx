import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card, CardHeader, CardBody, CardFooter } from '../Card'

describe('Card', () => {
  it('renders children inside card', () => {
    render(<Card><p>Card content</p></Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('renders with all padding options on CardBody', () => {
    const { rerender } = render(
      <Card>
        <CardBody padding="none">No padding</CardBody>
      </Card>,
    )
    expect(screen.getByText('No padding')).toBeInTheDocument()

    rerender(
      <Card>
        <CardBody padding="sm">Small padding</CardBody>
      </Card>,
    )
    expect(screen.getByText('Small padding')).toHaveClass('p-3')

    rerender(
      <Card>
        <CardBody padding="md">Medium padding</CardBody>
      </Card>,
    )
    expect(screen.getByText('Medium padding')).toHaveClass('p-4')

    rerender(
      <Card>
        <CardBody padding="lg">Large padding</CardBody>
      </Card>,
    )
    expect(screen.getByText('Large padding')).toHaveClass('p-6')
  })

  it('renders header slot if present', () => {
    render(
      <Card>
        <CardHeader>Header Content</CardHeader>
        <CardBody>Body</CardBody>
      </Card>,
    )
    expect(screen.getByText('Header Content')).toBeInTheDocument()
  })

  it('renders footer slot if present', () => {
    render(
      <Card>
        <CardBody>Body</CardBody>
        <CardFooter>Footer Content</CardFooter>
      </Card>,
    )
    expect(screen.getByText('Footer Content')).toBeInTheDocument()
  })

  it('applies custom className to Card', () => {
    const { container } = render(
      <Card className="my-card-class">
        <CardBody>Content</CardBody>
      </Card>,
    )
    // The Card wrapper div gets the className
    const cardDiv = container.firstChild as HTMLElement
    expect(cardDiv).toHaveClass('my-card-class')
  })
})
