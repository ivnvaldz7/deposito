import { cn } from '@/lib/utils'

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'warning-soft' | 'error' | 'info'
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-surface-highest text-on-surface-variant',
  success: 'border border-[#AFC8BA] bg-[#E7EFEA] text-[#3F6F5A]',
  warning: 'bg-warning/20 text-warning',
  'warning-soft': 'border border-[#D5B4B5] bg-[#F5ECEC] text-[#8E5A5B]',
  error: 'bg-error/20 text-error',
  info: 'border border-[#AFC8BA] bg-[#E7EFEA] text-[#3F6F5A]',
}

export function Badge({
  variant = 'default',
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center',
        'font-semibold text-xs',
        'px-2 py-0.5 rounded-full',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
