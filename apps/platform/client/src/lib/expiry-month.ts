/** Month-only lot dates use the years 2000–2099 and are stored at month end. */
export function maskExpiryMonth(value: string): string {
  const fullYear = /^(\d{2})\/?20(\d{2})$/.exec(value.trim())
  if (fullYear) return `${fullYear[1]}/${fullYear[2]}`
  const digits = value.replace(/\D/g, '')
  if (digits.length > 4) return value
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

export function parseExpiryMonth(value: string): { month: string; year: string; monthValue: string } | null {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value)
  if (!match) return null
  const year = `20${match[2]}`
  return { month: match[1], year, monthValue: `${year}-${match[1]}` }
}

export function expiryMonthToIso(value: string): string | null {
  const parts = parseExpiryMonth(value)
  return parts ? new Date(Date.UTC(Number(parts.year), Number(parts.month), 0, 23, 59, 59)).toISOString() : null
}

export function expiryMonthInputValue(value: string | null): string {
  if (!value) return ''
  const match = /^(20\d{2})-(0[1-9]|1[0-2])(?:$|-)/.exec(value)
  return match ? `${match[2]}/${match[1].slice(2)}` : value
}
