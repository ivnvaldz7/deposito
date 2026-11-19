import { useState, useRef, useEffect, useCallback } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'] as const
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

function todayISO(): string {
  return formatISO(new Date())
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDisplay(iso: string): string {
  if (!iso) return ''
  const d = parseISO(iso)
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function getMonthDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const grid: (number | null)[] = []

  // Fill leading empty cells
  for (let i = 0; i < firstDay; i++) grid.push(null)

  // Fill days
  for (let d = 1; d <= daysInMonth; d++) grid.push(d)

  return grid
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DatePickerInputProps {
  value: string       // ISO string YYYY-MM-DD
  onChange: (iso: string) => void
  id?: string
  label?: string
  error?: string
  autoFocus?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DatePickerInput({
  value,
  onChange,
  id,
  error,
  autoFocus,
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => value ? parseISO(value) : new Date())
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Sync viewDate when value changes externally
  useEffect(() => {
    if (value) setViewDate(parseISO(value))
  }, [value])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const days = getMonthDays(year, month)

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLButtonElement>('[data-cursor="true"]')?.focus()
  }, [open, viewDate])

  function closeAndFocus() {
    setOpen(false)
    inputRef.current?.focus()
  }

  const prevMonth = useCallback(() => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }, [])

  function selectDay(day: number) {
    const selected = new Date(year, month, day)
    const iso = formatISO(selected)
    onChange(iso)
    closeAndFocus()
  }

  function selectToday() {
    const iso = todayISO()
    onChange(iso)
    setViewDate(new Date())
    closeAndFocus()
  }

  function handleInputClick() {
    setViewDate(value ? parseISO(value) : new Date())
    setOpen(!open)
  }

  const displayValue = value ? formatDisplay(value) : ''
  const isToday = value === todayISO()

  return (
    <div ref={containerRef} className="relative" onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
      <div
        className="relative cursor-pointer"
        onClick={handleInputClick}
      >
        <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          readOnly
          value={displayValue}
          placeholder="Seleccioná una fecha"
          autoFocus={autoFocus}
          autoComplete="off"
          className="input-field pl-10 cursor-pointer"
          aria-expanded={open}
          aria-haspopup="dialog"
          onKeyDown={(e) => {
            if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
              e.preventDefault()
              handleInputClick()
            }
          }}
        />
      </div>

      {error && (
        <p className="font-body text-error text-xs mt-1">{error}</p>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog" aria-label="Elegir fecha del acta"
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAndFocus(); return }
            if (!(e.target instanceof HTMLElement) || !e.target.hasAttribute('data-cursor')) return
            const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
            const step = steps[e.key]
            if (step !== undefined) {
              e.preventDefault()
              setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + step))
            }
          }}
          className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-3rem)] bg-surface-container-high border border-white/10 rounded-xl shadow-float animate-fade-up overflow-hidden"
        >
          {/* Header: month / year navigation */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-highest transition-colors"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>

            <span className="text-sm font-semibold text-on-surface select-none">
              {MONTHS[month]} {year}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-highest transition-colors"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Day names */}
          <div className="grid grid-cols-7 px-3 pt-2 pb-1">
            {DAYS.map((d) => (
              <div
                key={d}
                className="font-body text-[11px] font-medium text-on-surface-variant/60 text-center uppercase tracking-wider"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 px-3 pb-2">
            {days.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="h-9" />
              }

              const dayDate = new Date(year, month, day)
              const dayISO = formatISO(dayDate)
              const isSelected = dayISO === value
              const isToday_ = dayISO === todayISO()

              return (
                <button
                  key={dayISO}
                  type="button"
                  data-cursor={day === viewDate.getDate()}
                  tabIndex={day === viewDate.getDate() ? 0 : -1}
                  aria-label={formatDisplay(dayISO)}
                  aria-pressed={isSelected}
                  onClick={() => selectDay(day)}
                  className={`
                    h-10 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-lg font-body text-sm transition-colors
                    ${isSelected
                      ? 'bg-primary text-on-primary font-semibold'
                      : isToday_
                        ? 'text-primary font-semibold hover:bg-primary-container/20'
                        : 'text-on-surface hover:bg-surface-highest'
                    }
                  `}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Footer: today button */}
          <div className="border-t border-white/5 px-3 py-2 flex justify-center">
            <button
              type="button"
              onClick={selectToday}
              className="font-body text-xs font-medium text-primary hover:text-primary-dim transition-colors"
            >
              {isToday ? 'Hoy' : 'Volver a hoy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
