import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'primary' | 'warning' | 'error'
  hover?: boolean
}

const variantStyles: Record<NonNullable<GlassCardProps['variant']>, string> = {
  default: 'border-white/10 hover:border-primary/50',
  primary: 'border-primary-container/30 hover:border-primary',
  warning: 'border-tertiary-container/30 hover:border-tertiary',
  error: 'border-error-container/50 hover:border-error',
}

const variantGlow: Record<NonNullable<GlassCardProps['variant']>, string> = {
  default: 'bg-primary-container/10',
  primary: 'bg-primary-container/10',
  warning: 'bg-tertiary-container/10',
  error: 'bg-error-container/10',
}

export function GlassCard({
  children,
  className,
  variant = 'default',
  hover = true,
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'bg-surface-container-high rounded-xl p-lg relative overflow-hidden',
        variantStyles[variant],
        hover && 'group transition-colors duration-300',
        className,
      )}
    >
      {children}
      {hover && (
        <div
          className={cn(
            'absolute -bottom-10 -right-10 w-32 h-32 rounded-full blur-2xl transition-all duration-500 pointer-events-none',
            variantGlow[variant],
            'group-hover:opacity-70 opacity-0',
          )}
        />
      )}
    </div>
  )
}
