const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
})

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Formats a bare `yyyy-mm-dd` date (e.g. `Expense.date`, `Purchase.payment_date`)
 * as dd/mm/yyyy. Appends a noon UTC time before parsing so the local
 * timezone offset never shifts it to the previous/next day. */
export function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate}T12:00:00`))
}

const artDateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Argentina/Buenos_Aires',
})

/** Formats a full ISO timestamp (e.g. `Sale.created_at`, `Exchange.created_at`)
 * as dd/mm/yyyy in Argentina time, discarding the time-of-day. The backend
 * sends a naive UTC string (no `Z`/offset) — appending `Z` here is what tells
 * `Date` to parse it as UTC instead of the browser's local time, then
 * `timeZone: 'America/Argentina/Buenos_Aires'` converts it for display, so a
 * late-night ART sale doesn't show as the next UTC day. */
export function formatDateTime(isoDateTime: string): string {
  const utcSuffixed = isoDateTime.endsWith('Z') ? isoDateTime : `${isoDateTime}Z`
  return artDateTimeFormatter.format(new Date(utcSuffixed))
}

const artTimestampFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
})

/** Same as `formatDateTime` but keeps the time-of-day, in Argentina time. */
export function formatTimestamp(isoDateTime: string): string {
  const utcSuffixed = isoDateTime.endsWith('Z') ? isoDateTime : `${isoDateTime}Z`
  return artTimestampFormatter.format(new Date(utcSuffixed))
}
