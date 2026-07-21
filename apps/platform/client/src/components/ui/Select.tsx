import { cn } from '@/lib/utils'

interface SelectProps {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function Select({
  label,
  error,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
}: SelectProps) {
  const selectId = label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={selectId}
          className="font-heading text-sm font-semibold text-on-surface-variant"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full font-body',
          'bg-surface-high text-on-surface',
          'border border-outline-variant rounded px-3 py-2',
          'focus:border-primary focus:outline-none',
          error && 'border-error',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="font-body text-xs text-error">{error}</p>
      )}
    </div>
  )
}
