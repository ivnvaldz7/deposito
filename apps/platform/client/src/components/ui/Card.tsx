import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
}

interface CardBodyProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingMap: Record<NonNullable<CardBodyProps['padding']>, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface-container border border-outline-variant rounded shadow-float',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'border-b border-outline-variant px-4 py-3 font-heading font-semibold',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardBody({ children, className, padding = 'md' }: CardBodyProps) {
  return <div className={cn(paddingMap[padding], className)}>{children}</div>
}

export function CardFooter({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'border-t border-outline-variant px-4 py-3',
        className,
      )}
    >
      {children}
    </div>
  )
}
