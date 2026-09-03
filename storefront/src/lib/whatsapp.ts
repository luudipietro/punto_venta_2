import type { CartLine } from '@/stores/cartStore'
import type { CartPreview } from '@/api/storefront'
import { formatCurrency, formatPriceOrConsult } from '@/lib/format'

/** Builds a wa.me deep link with the whole cart prefilled as the message —
 * this is the entire "checkout": the cashier and customer settle delivery/
 * payment over the WhatsApp chat that opens, nothing is submitted back to
 * this app. Lines with a hidden price ("Consultar precio") are excluded
 * from the total and called out separately, since they don't have a known
 * amount to add up. `preview`, when available, adds the same promotion
 * discount lines and discounted total the cart sidebar shows — pass
 * `undefined` to fall back to a naive sum (e.g. while the preview request
 * is still loading or failed). */
export function buildCartWhatsAppUrl(
  phoneNumber: string,
  lines: CartLine[],
  preview: CartPreview | undefined,
): string {
  const itemLines = lines.map((line, index) => {
    const variantText = line.variantLabel ? ` (${line.variantLabel})` : ''
    const priceText = formatPriceOrConsult(line.price)
    return `${index + 1}) ${line.productName}${variantText} x${line.quantity} - ${priceText}`
  })

  const hasConsultItems = lines.some((line) => line.price === null)

  const messageLines = ['¡Hola! Quiero hacer este pedido:', '', ...itemLines, '']

  if (preview) {
    for (const promo of preview.applied_promotions) {
      messageLines.push(`${promo.name}: -${formatCurrency(promo.discount_amount)}`)
    }
    if (preview.applied_promotions.length > 0) messageLines.push('')
    messageLines.push(
      `Total: ${formatCurrency(preview.total)}${hasConsultItems ? ' (+ precios a consultar)' : ''}`,
    )
  } else {
    const total = lines.reduce(
      (sum, line) => sum + (line.price ? Number(line.price) * line.quantity : 0),
      0,
    )
    messageLines.push(`Total: ${formatCurrency(total)}${hasConsultItems ? ' (+ precios a consultar)' : ''}`)
  }

  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(messageLines.join('\n'))}`
}
