import type { CartLine } from '@/stores/cartStore'
import { formatCurrency, formatPriceOrConsult } from '@/lib/format'

/** Builds a wa.me deep link with the whole cart prefilled as the message —
 * this is the entire "checkout": the cashier and customer settle delivery/
 * payment over the WhatsApp chat that opens, nothing is submitted back to
 * this app. Lines with a hidden price ("Consultar precio") are excluded
 * from the total and called out separately, since they don't have a known
 * amount to add up. */
export function buildCartWhatsAppUrl(phoneNumber: string, lines: CartLine[]): string {
  const itemLines = lines.map((line, index) => {
    const variantText = line.variantLabel ? ` (${line.variantLabel})` : ''
    const priceText = formatPriceOrConsult(line.price)
    return `${index + 1}) ${line.productName}${variantText} x${line.quantity} - ${priceText}`
  })

  const total = lines.reduce((sum, line) => sum + (line.price ? Number(line.price) * line.quantity : 0), 0)
  const hasConsultItems = lines.some((line) => line.price === null)

  const messageLines = [
    '¡Hola! Quiero hacer este pedido:',
    '',
    ...itemLines,
    '',
    `Total: ${formatCurrency(total)}${hasConsultItems ? ' (+ precios a consultar)' : ''}`,
  ]

  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageLines.join('\n'))}`
}
