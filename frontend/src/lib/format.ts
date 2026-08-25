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

/** Formats a full ISO timestamp (e.g. `Sale.created_at`, `Exchange.created_at`)
 * as dd/mm/yyyy, discarding the time-of-day. */
export function formatDateTime(isoDateTime: string): string {
  return dateFormatter.format(new Date(isoDateTime))
}
