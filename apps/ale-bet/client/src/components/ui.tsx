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
    <section className="space-y-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold text-white" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-[12px] text-[#6b7280]">{description}</p>
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
    <div className="rounded-[8px] border border-[#1e1e1e] bg-[#111111] px-4 py-[14px]">
      <p className="text-[10px] uppercase tracking-[0.8px] text-[#6b7280]">
        {label}
      </p>
      <p
        className={`mt-2 text-[22px] font-bold text-white ${accent}`}
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
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {label}
    </span>
  )
}
