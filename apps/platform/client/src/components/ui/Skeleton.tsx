import { cn } from '@/lib/utils'

interface SkeletonProps {
  variant?: 'text' | 'circle' | 'card'
  className?: string
  width?: string | number
  height?: string | number
}

const variantStyles: Record<NonNullable<SkeletonProps['variant']>, string> = {
  text: 'h-4 w-full rounded',
  circle: 'rounded-full',
  card: 'h-32 w-full rounded',
}

export function Skeleton({
  variant = 'text',
  className,
  width,
  height,
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-surface-highest',
        variantStyles[variant],
        variant === 'circle' && (width ? '' : 'h-10 w-10'),
        className,
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
      aria-hidden="true"
    />
  )
}
