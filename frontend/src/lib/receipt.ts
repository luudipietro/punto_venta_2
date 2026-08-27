import { jsPDF } from 'jspdf'
import { formatCurrency } from '@/lib/format'

export interface ReceiptItem {
  name: string
  variant?: string | null
  quantity: number
  unitPrice: number
}

export interface ReceiptPayment {
  methodName: string
  /** Gross amount actually charged through this method (e.g. what the card
   * terminal shows, surcharge included). */
  amount: number
}

/** 'thermal' prints on an 80mm-wide roll (the ticket's native size).
 * 'a4' keeps the exact same ticket-width content but centers it on a full
 * A4 sheet, so a shop without a thermal printer can still print it on a
 * regular printer — just one mostly-blank page instead of special paper. */
export type ReceiptFormat = 'thermal' | 'a4'

export interface ReceiptInput {
  companyName: string
  saleId: number
  createdAt: Date
  items: ReceiptItem[]
  subtotal: number
  discount: number
  promotionDiscount: number
  /** Sale total before any payment-method surcharge. */
  total: number
  customerName?: string | null
  payments?: ReceiptPayment[]
}

export interface ExchangeReceiptInput {
  companyName: string
  exchangeId: number
  saleId: number
  createdAt: Date
  returnedItems: ReceiptItem[]
  newItems: ReceiptItem[]
  balance: number
  customerName?: string | null
  payments?: ReceiptPayment[]
}

const CONTENT_WIDTH_MM = 80
const MARGIN_MM = 4
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const A4_OFFSET_X = (A4_WIDTH_MM - CONTENT_WIDTH_MM) / 2

/** "Talle L" / "Color Rojo" instead of a bare "L" that reads like a quantity
 * on the printed receipt. */
export function formatVariantForReceipt(
  colorName: string | null | undefined,
  sizeLabel: string | null | undefined,
): string {
  return [colorName ? `Color ${colorName}` : null, sizeLabel ? `Talle ${sizeLabel}` : null]
    .filter(Boolean)
    .join(', ')
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

/** Sums the gross amount actually collected across payment lines — if it
 * differs from the sale/exchange's own total, the difference is a payment
 * method surcharge (e.g. a card) that should show up as its own line rather
 * than silently repricing every item. */
function grossTotal(payments: ReceiptPayment[] | undefined, fallback: number): number {
  if (!payments || payments.length === 0) return fallback
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

class Ticket {
  doc: jsPDF
  y = 8
  offsetX: number
  centerX: number

  constructor(format: ReceiptFormat, estimatedContentHeight: number) {
    if (format === 'a4') {
      this.doc = new jsPDF({ unit: 'mm', format: [A4_WIDTH_MM, A4_HEIGHT_MM] })
      this.offsetX = A4_OFFSET_X
    } else {
      this.doc = new jsPDF({
        unit: 'mm',
        format: [CONTENT_WIDTH_MM, Math.max(estimatedContentHeight, 90)],
      })
      this.offsetX = 0
    }
    this.centerX = this.offsetX + CONTENT_WIDTH_MM / 2
    this.doc.setFont('courier', 'normal')
  }

  left(): number {
    return this.offsetX + MARGIN_MM
  }

  right(): number {
    return this.offsetX + CONTENT_WIDTH_MM - MARGIN_MM
  }

  row(left: string, right: string) {
    this.doc.text(left, this.left(), this.y)
    this.doc.text(right, this.right(), this.y, { align: 'right' })
    this.y += 4.2
  }

  center(text: string) {
    this.doc.text(text, this.centerX, this.y, { align: 'center' })
    this.y += 4.2
  }

  dashLine() {
    this.center('-'.repeat(46))
  }

  header(companyName: string, subtitle: string) {
    this.doc.setFontSize(13)
    this.doc.setFont('courier', 'bold')
    this.center(companyName)
    this.doc.setFontSize(8)
    this.doc.setFont('courier', 'normal')
    this.center(subtitle)
    this.dashLine()
  }

  itemLine(item: ReceiptItem, signPrefix = '') {
    const label = item.variant ? `${item.name} (${item.variant})` : item.name
    this.doc.text(truncate(`${signPrefix}${label}`, 40), this.left(), this.y)
    this.y += 4.2
    const lineTotal = item.unitPrice * item.quantity
    this.row(`  ${item.quantity} x ${formatCurrency(item.unitPrice)}`, formatCurrency(lineTotal))
  }
}

/** Builds a lightweight "thermal ticket" style receipt — a proof-of-purchase
 * comprobante, not a fiscal invoice. Height grows with the number of items
 * so there's no wasted paper/space on a real thermal printer. */
export function buildReceiptPdf(input: ReceiptInput, format: ReceiptFormat = 'thermal'): jsPDF {
  const total = grossTotal(input.payments, input.total)
  const surcharge = total - input.total

  const estimatedHeight =
    46 + input.items.length * 4.2 * 2 + 40 + (input.customerName ? 4.2 : 0)
  const t = new Ticket(format, estimatedHeight)

  t.header(input.companyName, 'Comprobante de venta')

  const dateLabel = input.createdAt.toLocaleDateString('es-AR')
  const timeLabel = input.createdAt.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  t.row('Fecha', dateLabel)
  t.row('Hora', timeLabel)
  t.row('Total', formatCurrency(total))
  if (input.customerName) {
    t.row('Cliente', input.customerName)
  }
  t.row('Venta', `#${input.saleId}`)
  t.dashLine()

  for (const item of input.items) {
    t.itemLine(item)
  }
  t.dashLine()

  t.row('Subtotal', formatCurrency(input.subtotal))
  if (input.promotionDiscount > 0) {
    t.row('Descuento promoción', `-${formatCurrency(input.promotionDiscount)}`)
  }
  if (input.discount > 0) {
    t.row('Descuento', `-${formatCurrency(input.discount)}`)
  }
  if (surcharge > 0.005 && input.payments) {
    const methodNames = input.payments.map((p) => p.methodName).join(', ')
    t.row(`Recargo (${truncate(methodNames, 20)})`, formatCurrency(surcharge))
  }

  t.dashLine()
  t.doc.setFontSize(11)
  t.doc.setFont('courier', 'bold')
  t.row('TOTAL', formatCurrency(total))
  t.y += 2

  t.doc.setFontSize(8)
  t.doc.setFont('courier', 'normal')
  t.dashLine()
  t.center('¡Gracias por su compra!')
  t.center('Este comprobante no es una factura')

  return t.doc
}

export function downloadReceiptPdf(input: ReceiptInput, format: ReceiptFormat = 'thermal'): void {
  const doc = buildReceiptPdf(input, format)
  doc.save(`recibo-venta-${input.saleId}.pdf`)
}

/** Same ticket format as the sale receipt, for a Cambio/Devolución: returned
 * items restock (shown as a refund/credit), new items destock (shown as a
 * charge), and the net `balance` (positive = customer paid more, negative =
 * refunded) replaces the sale's subtotal/discount breakdown. */
export function buildExchangeReceiptPdf(
  input: ExchangeReceiptInput,
  format: ReceiptFormat = 'thermal',
): jsPDF {
  const total = grossTotal(input.payments, input.balance)

  const estimatedHeight =
    46 + (input.returnedItems.length + input.newItems.length) * 4.2 * 2 + 40

  const t = new Ticket(format, estimatedHeight)
  t.header(input.companyName, 'Comprobante de cambio / devolución')

  const dateLabel = input.createdAt.toLocaleDateString('es-AR')
  const timeLabel = input.createdAt.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  t.row('Fecha', dateLabel)
  t.row('Hora', timeLabel)
  t.row('Diferencia', formatCurrency(total))
  if (input.customerName) {
    t.row('Cliente', input.customerName)
  }
  t.row('Venta original', `#${input.saleId}`)
  t.row('Cambio', `#${input.exchangeId}`)
  t.dashLine()

  if (input.returnedItems.length > 0) {
    t.center('Devuelto')
    for (const item of input.returnedItems) t.itemLine(item, '- ')
    t.dashLine()
  }
  if (input.newItems.length > 0) {
    t.center('Entregado')
    for (const item of input.newItems) t.itemLine(item)
    t.dashLine()
  }

  t.doc.setFontSize(11)
  t.doc.setFont('courier', 'bold')
  t.row(total >= 0 ? 'A PAGAR' : 'A REINTEGRAR', formatCurrency(Math.abs(total)))
  t.y += 2

  t.doc.setFontSize(8)
  t.doc.setFont('courier', 'normal')
  t.dashLine()
  t.center('¡Gracias por su visita!')
  t.center('Este comprobante no es una factura')

  return t.doc
}

export function downloadExchangeReceiptPdf(
  input: ExchangeReceiptInput,
  format: ReceiptFormat = 'thermal',
): void {
  const doc = buildExchangeReceiptPdf(input, format)
  doc.save(`recibo-cambio-${input.exchangeId}.pdf`)
}
