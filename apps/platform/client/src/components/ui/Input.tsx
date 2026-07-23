import { cn } from '@/lib/utils'

interface InputProps {
  label?: string
  error?: string
  icon?: React.ReactNode
  placeholder?: string
  value: string
  onChange: (value: string) => void
  type?: string
  disabled?: boolean
  className?: string
}

export function Input({
  label,
  error,
  icon,
  placeholder,
  value,
  onChange,
  type = 'text',
  disabled = false,
  className,
}: InputProps) {
  const inputId = label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="font-heading text-sm font-semibold text-on-surface-variant"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'w-full font-body',
            'bg-surface-container-high text-on-surface',
            'border border-outline-variant rounded px-3 py-2',
            'placeholder:text-on-surface-variant placeholder:opacity-60',
            'focus:border-primary focus:outline-none',
            error && 'border-error',
            icon && 'pl-10',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        />
      </div>
      {error && (
        <p className="font-body text-xs text-error">{error}</p>
      )}
    </div>
  )
}
