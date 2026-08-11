import type { ReactNode } from 'react'

interface InventoryPageHeaderStat {
  label: string
  value: number | string
  warning?: boolean
  icon?: ReactNode
}

interface InventoryPageHeaderAction {
  label: string
  onClick: () => void
  icon?: ReactNode
}

interface InventoryPageHeaderProps {
  title: string
  description?: string
  stats: InventoryPageHeaderStat[]
  primaryAction?: InventoryPageHeaderAction
  secondaryActions?: InventoryPageHeaderAction[]
  children?: ReactNode
}

export function InventoryPageHeader({
  title,
  description,
  stats,
  primaryAction,
  secondaryActions,
  children,
}: InventoryPageHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">{title}</h1>
          {description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}
        </div>
        {primaryAction && (
          <button type="button" onClick={primaryAction.onClick} className="btn-primary inline-flex min-h-10 items-center justify-center gap-2 self-start px-5 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
            {primaryAction.icon}{primaryAction.label}
          </button>
        )}
      </div>
      <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <article key={stat.label} className="min-h-28 rounded-xl border border-outline-variant/20 bg-surface-container-low p-5">
            <div className="flex items-start justify-between">
              <p className="text-sm text-on-surface-variant">{stat.label}</p>{stat.icon}
            </div>
            <p className={`mt-4 text-3xl font-bold tabular-nums ${stat.warning ? 'text-error' : 'text-on-surface'}`}>{stat.value}</p>
          </article>
        ))}
      </section>
      {secondaryActions?.length || children ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low p-3">
          {secondaryActions?.map((action) => (
            <button key={action.label} type="button" onClick={action.onClick} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-on-surface hover:bg-surface-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {action.icon}{action.label}
            </button>
          ))}
          {children}
        </div>
      ) : null}
    </div>
  )
}

