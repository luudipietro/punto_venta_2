const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** `price` arrives from the API as a JSON string (Decimal), not a number —
 * same gotcha as the admin frontend's money fields. */
export function formatCurrency(price: string | number): string {
  return currencyFormatter.format(Number(price))
}

/** `null` means the admin hid this product's price from the storefront
 * (`Product.price_hidden_from_storefront`) — shown as "Consultar precio"
 * everywhere a price would otherwise render. */
export function formatPriceOrConsult(price: string | null): string {
  return price === null ? 'Consultar precio' : formatCurrency(price)
}
