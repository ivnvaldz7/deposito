import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function InventoryDataSurface({ label, children }: { label: string; children: ReactNode }) {
  return <section aria-label={label} className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-low">{children}</section>
}

interface RowActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title' | 'aria-label'> {
  label: string
  icon: ReactNode
  destructive?: boolean
}

export function RowActionButton({ label, icon, destructive = false, className = '', ...props }: RowActionButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40 ${destructive ? 'hover:text-error' : 'hover:text-on-surface'} ${className}`}
      {...props}
    >
      {icon}
    </button>
  )
}
