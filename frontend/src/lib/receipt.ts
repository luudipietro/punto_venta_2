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
 * regular printer — just one mostly-blank page instead of special paper.
 * 'a6' uses the *entire* width of an A6 sheet (105mm) and is capped at the
 * A6 page height (148mm) — unlike 'thermal', it never grows past that. */
export type ReceiptFormat = 'thermal' | 'a4' | 'a6'

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
const A6_WIDTH_MM = 105
const A6_HEIGHT_MM = 148
const DEFAULT_LINE_STEP_MM = 4.2
const MIN_LINE_STEP_MM = 2.6

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

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

function slugify(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
  return base || 'sin-cliente'
}

function filenameDateTime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
}

/** Sums the gross amount actually collected across payment lines — if it
 * differs from the sale/exchange's own total, the difference is a payment
 * method surcharge (e.g. a card). Rather than print that difference as its
 * own "Recargo" line, callers use the ratio between this and the net total
 * to reprice every line item up to what was actually charged (a "list
 * price" that already includes the surcharge). */
function grossTotal(payments: ReceiptPayment[] | undefined, fallback: number): number {
  if (!payments || payments.length === 0) return fallback
  // `Number(...)`: defends against a caller passing a value straight from
  // the API (which serializes Decimal fields as JSON strings) — bare `+`
  // on a string silently concatenates instead of adding, corrupting the
  // total for any receipt built from 2+ payments (see the same bug fixed
  // in SalesHistoryPage.tsx/ExchangeDetailPanel.tsx).
  return payments.reduce((sum, p) => sum + Number(p.amount), 0)
}

class Ticket {
  doc: jsPDF
  y = 8
  offsetX: number
  centerX: number
  width: number
  lineStep: number

  constructor(format: ReceiptFormat, estimatedContentHeight: number) {
    if (format === 'a4') {
      this.doc = new jsPDF({ unit: 'mm', format: [A4_WIDTH_MM, A4_HEIGHT_MM] })
      this.offsetX = A4_OFFSET_X
      this.width = CONTENT_WIDTH_MM
      this.lineStep = DEFAULT_LINE_STEP_MM
    } else if (format === 'a6') {
      this.doc = new jsPDF({ unit: 'mm', format: [A6_WIDTH_MM, A6_HEIGHT_MM] })
      this.offsetX = 0
      this.width = A6_WIDTH_MM
      const available = A6_HEIGHT_MM - this.y - 6
      const scale = estimatedContentHeight > available ? available / estimatedContentHeight : 1
      this.lineStep = Math.max(MIN_LINE_STEP_MM, DEFAULT_LINE_STEP_MM * Math.min(1, scale))
    } else {
      this.doc = new jsPDF({
        unit: 'mm',
        format: [CONTENT_WIDTH_MM, Math.max(estimatedContentHeight, 90)],
      })
      this.offsetX = 0
      this.width = CONTENT_WIDTH_MM
      this.lineStep = DEFAULT_LINE_STEP_MM
    }
    this.centerX = this.offsetX + this.width / 2
    this.doc.setFont('courier', 'normal')
  }

  left(): number {
    return this.offsetX + MARGIN_MM
  }

  right(): number {
    return this.offsetX + this.width - MARGIN_MM
  }

  row(left: string, right: string) {
    this.doc.text(left, this.left(), this.y)
    this.doc.text(right, this.right(), this.y, { align: 'right' })
    this.y += this.lineStep
  }

  center(text: string) {
    this.doc.text(text, this.centerX, this.y, { align: 'center' })
    this.y += this.lineStep
  }

  dashLine() {
    const contentWidth = this.width - 2 * MARGIN_MM
    const dashCount = Math.max(10, Math.round((46 * contentWidth) / (CONTENT_WIDTH_MM - 2 * MARGIN_MM)))
    this.center('-'.repeat(dashCount))
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
    const maxWidth = this.width - 2 * MARGIN_MM
    const rawLines = this.doc.splitTextToSize(`${signPrefix}${label}`, maxWidth) as string[]
    const shown = rawLines.slice(0, 2)
    if (rawLines.length > 2 && shown.length === 2) {
      shown[1] = `${shown[1].slice(0, Math.max(shown[1].length - 1, 0))}…`
    }
    for (const line of shown) {
      this.doc.text(line, this.left(), this.y)
      this.y += this.lineStep
    }
    const lineTotal = item.unitPrice * item.quantity
    this.row(`  ${item.quantity} x ${formatCurrency(item.unitPrice)}`, formatCurrency(lineTotal))
  }
}

/** Reprices every item/subtotal/discount line up to what was actually
 * charged (list price already including any payment-method surcharge),
 * instead of showing a separate "Recargo" line — e.g. a $10 shirt paid with
 * a 10%-surcharge card prints as $11. */
function applySurchargeToLinePrices(
  items: ReceiptItem[],
  subtotal: number,
  promotionDiscount: number,
  discount: number,
  ratio: number,
): { items: ReceiptItem[]; subtotal: number; promotionDiscount: number; discount: number } {
  if (Math.abs(ratio - 1) < 1e-9) {
    return { items, subtotal, promotionDiscount, discount }
  }
  return {
    items: items.map((item) => ({ ...item, unitPrice: roundCents(item.unitPrice * ratio) })),
    subtotal: roundCents(subtotal * ratio),
    promotionDiscount: roundCents(promotionDiscount * ratio),
    discount: roundCents(discount * ratio),
  }
}

/** Builds a lightweight "thermal ticket" style receipt — a proof-of-purchase
 * comprobante, not a fiscal invoice. Height grows with the number of items
 * so there's no wasted paper/space on a real thermal printer. */
export function buildReceiptPdf(input: ReceiptInput, format: ReceiptFormat = 'thermal'): jsPDF {
  const total = grossTotal(input.payments, input.total)
  const ratio = input.total > 0 ? total / input.total : 1
  const priced = applySurchargeToLinePrices(
    input.items,
    input.subtotal,
    input.promotionDiscount,
    input.discount,
    ratio,
  )

  const estimatedHeight =
    46 + priced.items.length * DEFAULT_LINE_STEP_MM * 3 + 40 + (input.customerName ? DEFAULT_LINE_STEP_MM : 0)
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
  t.dashLine()

  for (const item of priced.items) {
    t.itemLine(item)
  }
  t.dashLine()

  t.row('Subtotal', formatCurrency(priced.subtotal))
  if (priced.promotionDiscount > 0) {
    t.row('Descuento promoción', `-${formatCurrency(priced.promotionDiscount)}`)
  }
  if (priced.discount > 0) {
    t.row('Descuento', `-${formatCurrency(priced.discount)}`)
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
  const total = grossTotal(input.payments, input.total)
  const filename = `${filenameDateTime(input.createdAt)}-${Math.round(total)}-${slugify(input.customerName ?? '')}-${input.saleId}.pdf`
  doc.save(filename)
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
    46 + (input.returnedItems.length + input.newItems.length) * DEFAULT_LINE_STEP_MM * 3 + 40

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
  const total = grossTotal(input.payments, input.balance)
  const filename = `${filenameDateTime(input.createdAt)}-${Math.round(Math.abs(total))}-${slugify(input.customerName ?? '')}-${input.exchangeId}.pdf`
  doc.save(filename)
}
