import type { ReactNode } from 'react'

interface InventoryPageHeaderStat {
  label: string
  value: number | string
  warning?: boolean
  icon?: ReactNode
  onClick?: () => void
  active?: boolean
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
  actionSlot?: ReactNode
  secondaryActions?: InventoryPageHeaderAction[]
  children?: ReactNode
}

export function InventoryPageHeader({
  title,
  description,
  stats,
  primaryAction,
  actionSlot,
  secondaryActions,
  children,
}: InventoryPageHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}
        </div>
        {(actionSlot || primaryAction) && (
          <div className="w-full self-start sm:w-auto">
            {actionSlot}
            {primaryAction && (
              <button type="button" onClick={primaryAction.onClick} className="btn-primary btn-press inline-flex min-h-11 w-full items-center justify-center gap-2 self-start px-5 py-2.5 text-sm sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
                {primaryAction.icon}{primaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
      <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-2">
        {stats.map((stat, index) => (
          <article
            key={stat.label}
            className={`min-h-24 rounded-xl border p-4 animate-reveal sm:min-h-28 sm:p-5 transition-[background-color,border-color,transform,box-shadow] ${
              stat.active
                ? 'bg-primary-container/20 border-primary/50 ring-1 ring-primary/50'
                : 'border-outline-variant/20 bg-surface-container-low'
            } ${
              stat.onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:bg-surface-bright hover:shadow-float focus:outline-none focus:ring-2 focus:ring-primary' : ''
            }`}
            style={{ animationDelay: `${index * 45}ms` }}
            onClick={stat.onClick}
            role={stat.onClick ? "button" : undefined}
            tabIndex={stat.onClick ? 0 : undefined}
            onKeyDown={stat.onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stat.onClick?.(); } } : undefined}
          >
            <div className="flex items-start justify-between">
              <p className="text-sm text-on-surface-variant">{stat.label.toUpperCase()}</p>{stat.icon}
            </div>
            <p className={`mt-3 text-3xl font-bold tabular-nums sm:mt-4 ${stat.warning && !stat.active ? 'text-error' : 'text-on-surface'}`}>{stat.value}</p>
          </article>
        ))}
      </section>
      {children ? (
        <section
          aria-label="Filtros"
          className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-3"
        >
          {children}
        </section>
      ) : null}
      {secondaryActions?.length ? (
        <div aria-label="Acciones contextuales" className="flex flex-wrap items-center gap-2">
          {secondaryActions?.map((action) => (
            <button key={action.label} type="button" onClick={action.onClick} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-on-surface btn-press hover:bg-surface-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {action.icon}{action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}


