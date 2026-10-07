import { cn } from '@/lib/utils'

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-primary text-on-primary hover:opacity-90',
  secondary:
    'bg-surface-high text-on-surface hover:bg-surface-highest',
  ghost:
    'text-on-surface-variant hover:bg-surface-high',
  outline:
    'border border-outline-variant text-on-surface hover:bg-surface-high',
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm min-h-[36px]',
  md: 'px-4 py-2 text-sm min-h-[40px]',
  lg: 'px-6 py-3 text-base min-h-[44px]',
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  onClick,
  type = 'button',
  className,
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={cn(
        // Layout
        'inline-flex items-center justify-center gap-2',
        'font-semibold',
        'rounded',
        // Color transition
        'transition-colors',
        // DESIGN-01: press feedback — scale responds to pointer-down immediately.
        // Disabled state keeps opacity+cursor, not scale.
        'active:scale-[0.97]',
        'transition-[transform,opacity]',
        'duration-[var(--motion-instant,120ms)]',
        variantStyles[variant],
        sizeStyles[size],
        isDisabled && 'cursor-not-allowed opacity-50 active:scale-100',
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
