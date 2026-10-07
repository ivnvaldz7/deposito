export class ExpiryMonthValidationError extends Error {}

export function parseExpiryMonth(value: string, now = new Date()): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) throw new ExpiryMonthValidationError('Vencimiento inválido. Usá mes y año (MM/AAAA).')

  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || month < 1 || month > 12) {
    throw new ExpiryMonthValidationError('Vencimiento inválido. Usá mes y año (MM/AAAA).')
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
  }).formatToParts(now)
  const currentYear = Number(parts.find((part) => part.type === 'year')?.value)
  const currentMonth = Number(parts.find((part) => part.type === 'month')?.value)
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    throw new ExpiryMonthValidationError('El vencimiento no puede ser anterior al mes actual.')
  }

  return new Date(Date.UTC(year, month, 0))
}
