const OPERATING_TIME_ZONE = 'America/Argentina/Buenos_Aires'

export function formatExpiryMonth(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`
}

export function validateExpirySelection(monthValue: string | undefined, yearValue: string | undefined, now = new Date()): string | null {
  if (!/^(0[1-9]|1[0-2])$/.test(monthValue ?? '') || !/^\d{4}$/.test(yearValue ?? '')) return 'Seleccioná mes y año de vencimiento'
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: OPERATING_TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(now)
  const currentYear = Number(parts.find((part) => part.type === 'year')?.value)
  const currentMonth = Number(parts.find((part) => part.type === 'month')?.value)
  const selected = Number(yearValue) * 12 + Number(monthValue)
  return selected < currentYear * 12 + currentMonth ? 'El vencimiento no puede ser anterior al mes actual' : null
}
