import type { ReactNode } from 'react'

interface PageHeaderStat {
  label: string
  value: number | string
  warning?: boolean
}

interface PageHeaderAction {
  label: string
  onClick: () => void
  icon?: ReactNode
}

interface PageHeaderProps {
  title: string
  stats: PageHeaderStat[]
  primaryAction?: PageHeaderAction
  secondaryActions?: PageHeaderAction[]
  children?: ReactNode
}

export function PageHeader({
  title,
  stats,
  primaryAction,
  secondaryActions,
  children,
}: PageHeaderProps) {
  return (
    <div className="space-y-4">
      <section
        className="rounded px-6 py-6"
        style={{ backgroundColor: '#181d18' }}
      >
        <div className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="font-heading text-2xl font-bold uppercase tracking-tight text-on-surface">
              {title}
            </h1>

            {primaryAction ? (
              <div className="flex shrink-0 justify-start sm:justify-end">
                <button
                  type="button"
                  onClick={primaryAction.onClick}
                  className="inline-flex w-auto items-center gap-2 self-start rounded px-5 py-2.5 font-heading text-sm font-semibold transition-[box-shadow] hover:[box-shadow:inset_0_0_0_999px_rgba(255,255,255,0.10)]"
                  style={{ backgroundColor: '#00AE42', color: '#00380f' }}
                >
                  {primaryAction.icon}
                  {primaryAction.label}
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-[110px]">
                <p
                  className="font-heading text-3xl font-bold leading-none"
                  style={{ color: stat.warning ? '#FF9800' : '#00AE42' }}
                >
                  {stat.value}
                </p>
                <p className="mt-2 font-body text-xs uppercase tracking-widest text-on-surface-variant">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {secondaryActions?.length ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {secondaryActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="inline-flex w-auto items-center justify-center gap-2 self-start rounded px-4 py-2 font-heading text-sm font-semibold text-on-surface transition-colors hover:bg-surface-bright"
                  style={{ backgroundColor: '#262b27' }}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {children ? (
        <div
          className="rounded px-6 py-4"
          style={{ backgroundColor: '#181d18' }}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
