import type { ReactNode } from 'react'

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string
  description?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="space-y-5">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-bold tracking-[-0.02em] text-[var(--color-text)]" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-[13px] text-[var(--color-text-2)]">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function StatCard({
  label,
  value,
  accent = 'text-[var(--primary-container)]',
}: {
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="app-panel rounded-[12px] px-5 py-4">
      <p className="text-[10px] uppercase tracking-[0.8px] text-[var(--color-text-3)]">
        {label}
      </p>
      <p
        className={`mt-2 text-[24px] font-bold leading-none text-[var(--color-text)] ${accent}`}
        style={{ fontFamily: 'Montserrat, sans-serif' }}
      >
        {value}
      </p>
    </div>
  )
}

export function StatusChip({ label, tone }: { label: string; tone: 'green' | 'slate' | 'amber' | 'red' | 'blue' }) {
  const tones = {
    green: 'bg-emerald-500/12 text-emerald-300',
    slate: 'bg-slate-500/12 text-slate-300',
    amber: 'bg-amber-500/12 text-amber-300',
    red: 'bg-rose-500/12 text-rose-300',
    blue: 'bg-sky-500/12 text-sky-300',
  }

  return (
    <span className={`inline-flex rounded-full border border-white/6 px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>
      {label}
    </span>
  )
}
