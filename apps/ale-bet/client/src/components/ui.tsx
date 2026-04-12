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
    <section className="rounded-2xl border border-white/6 bg-[var(--surface-low)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-[Montserrat] text-lg font-semibold text-[var(--on-surface)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">{description}</p>
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
    <div className="rounded-2xl border border-white/6 bg-[var(--surface-low)] p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">
        {label}
      </p>
      <p className={`mt-3 font-[Montserrat] text-3xl font-semibold ${accent}`}>{value}</p>
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
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {label}
    </span>
  )
}
