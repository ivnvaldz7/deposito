import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

interface StatusBadgeProps {
  variant: 'optimal' | 'low' | 'critical' | 'success' | 'warning' | 'error' | 'info'
  label: string
  showDot?: boolean
}

const variantStyles: Record<StatusBadgeProps['variant'], string> = {
  optimal: 'bg-primary-container/10 border-primary-container/20 text-primary',
  low: 'bg-tertiary-container/10 border-tertiary-container/20 text-tertiary',
  critical: 'bg-error-container/10 border-error-container/20 text-error',
  success: 'bg-primary-container/10 border-primary-container/20 text-primary',
  warning: 'bg-tertiary-container/10 border-tertiary-container/20 text-tertiary',
  error: 'bg-error-container/10 border-error-container/20 text-error',
  info: 'bg-surface-variant border-outline-variant text-on-surface-variant',
}

export function StatusBadge({ variant, label, showDot = true }: StatusBadgeProps) {
  const isCritical = variant === 'critical'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold',
        variantStyles[variant],
      )}
    >
      {isCritical ? (
        <AlertTriangle size={14} className="shrink-0" />
      ) : showDot ? (
        <div
          className={cn(
            'w-2 h-2 rounded-full shrink-0',
            variant === 'optimal' && 'bg-primary shadow-[0_0_8px_rgba(163,209,182,0.6)]',
            variant === 'low' && 'bg-tertiary',
            variant === 'success' && 'bg-primary',
            variant === 'warning' && 'bg-tertiary',
            variant === 'error' && 'bg-error',
            variant === 'info' && 'bg-on-surface-variant',
          )}
        />
      ) : null}
      <span>{label}</span>
    </div>
  )
}
