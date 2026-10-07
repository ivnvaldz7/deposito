import React, { useState, useEffect, useRef } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${d}/${m}/${y}`
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

interface DatePickerProps {
  value: string
  onChange: (val: string) => void
  className?: string
  placeholder?: string
  'aria-label'?: string
}

export function DatePicker({ value, onChange, className = '', placeholder = 'Seleccionar fecha', 'aria-label': ariaLabel }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const initialDate = value ? new Date(value + 'T00:00:00') : new Date()
  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth())
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear())

  // Update calendar view when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00')
      if (!isNaN(d.getTime())) {
        setCurrentMonth(d.getMonth())
        setCurrentYear(d.getFullYear())
      }
    }
  }, [value])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(y => y - 1)
    } else {
      setCurrentMonth(m => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(y => y + 1)
    } else {
      setCurrentMonth(m => m + 1)
    }
  }

  const handleSelectDate = (day: number) => {
    const m = String(currentMonth + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    onChange(`${currentYear}-${m}-${d}`)
    setIsOpen(false)
  }

  const handleHoy = () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    onChange(`${y}-${m}-${d}`)
    setCurrentMonth(today.getMonth())
    setCurrentYear(today.getFullYear())
    setIsOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setIsOpen(false)
  }

  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth)
  const blanks = Array.from({ length: firstDay === 0 ? 6 : firstDay - 1 }, (_, i) => i) // Lunes como primer día

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={ariaLabel || placeholder}
        aria-expanded={isOpen}
        className={`flex items-center justify-between text-left ${className} ${!value ? 'text-on-surface-variant' : 'text-on-surface'}`}
      >
        <span>{value ? formatDate(value) : placeholder}</span>
        <CalendarIcon size={16} className="text-outline shrink-0 ml-2" />
      </button>

      {isOpen && (
        <>
          {/* Overlay for mobile to close when tapping outside easily, and centering */}
          <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setIsOpen(false)} />

          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[300px] md:absolute md:top-auto md:left-0 md:translate-x-0 md:translate-y-0 md:mt-1 md:w-[280px] rounded-xl border border-white/10 bg-surface-container-high p-4 md:p-3 shadow-lg" role="dialog" aria-label="Selector de fecha">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded hover:bg-surface-variant transition-colors"
                aria-label="Mes anterior"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="font-semibold text-[14px] text-on-surface">
                {MONTHS[currentMonth]} {currentYear}
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded hover:bg-surface-variant transition-colors"
                aria-label="Mes siguiente"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Days Header */}
            <div className="grid grid-cols-7 mb-2 gap-1">
              {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map(day => (
                <div key={day} className="text-center font-semibold text-[10px] text-outline uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {blanks.map(b => (
                <div key={`blank-${b}`} className="h-8 w-8 md:h-7 md:w-7" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const isSelected = value === dateStr

                // Get local today string in YYYY-MM-DD
                const todayDate = new Date()
                const todayY = todayDate.getFullYear()
                const todayM = String(todayDate.getMonth() + 1).padStart(2, '0')
                const todayD = String(todayDate.getDate()).padStart(2, '0')
                const isToday = `${todayY}-${todayM}-${todayD}` === dateStr

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleSelectDate(day)}
                    aria-label={`Seleccionar ${day} de ${MONTHS[currentMonth]} de ${currentYear}`}
                    className={`
                      h-8 w-8 md:h-7 md:w-7 rounded-full flex items-center justify-center font-body text-[13px] transition-colors
                      ${isSelected
                        ? 'bg-primary text-on-primary font-bold'
                        : isToday
                          ? 'border border-primary text-primary font-semibold hover:bg-primary/10'
                          : 'text-on-surface hover:bg-surface-variant'
                      }
                    `}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={handleClear}
                className="text-[12px] font-medium text-error hover:text-error/80 transition-colors py-1 px-2 -ml-2 rounded hover:bg-error/10"
              >
                Borrar
              </button>
              <button
                type="button"
                onClick={handleHoy}
                className="text-[12px] font-medium text-primary hover:text-primary/80 transition-colors py-1 px-2 -mr-2 rounded hover:bg-primary/10"
              >
                Hoy
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
