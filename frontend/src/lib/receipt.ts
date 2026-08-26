import { jsPDF } from 'jspdf'
import { formatCurrency } from '@/lib/format'

export interface ReceiptItem {
  name: string
  variant?: string | null
  quantity: number
  unitPrice: number
}

export interface ReceiptInput {
  companyName: string
  saleId: number
  createdAt: Date
  items: ReceiptItem[]
  subtotal: number
  discount: number
  promotionDiscount: number
  total: number
  customerName?: string | null
}

const PAGE_WIDTH_MM = 80
const MARGIN_MM = 4

/** Builds a lightweight "thermal ticket" style receipt (80mm-wide roll,
 * monospace, dashed separators) — a proof-of-purchase comprobante, not a
 * fiscal invoice. Height grows with the number of items so there's no wasted
 * paper/space, matching how a real thermal printer would cut the ticket. */
export function buildReceiptPdf(input: ReceiptInput): jsPDF {
  const lineHeight = 4.2
  const estimatedHeight =
    38 + input.items.length * lineHeight * 2 + 34 + (input.customerName ? lineHeight : 0)

  const doc = new jsPDF({ unit: 'mm', format: [PAGE_WIDTH_MM, Math.max(estimatedHeight, 90)] })
  doc.setFont('courier', 'normal')

  let y = 8
  const centerX = PAGE_WIDTH_MM / 2

  doc.setFontSize(13)
  doc.setFont('courier', 'bold')
  doc.text(input.companyName, centerX, y, { align: 'center' })
  y += 5
  doc.setFontSize(8)
  doc.setFont('courier', 'normal')
  doc.text('Comprobante de venta', centerX, y, { align: 'center' })
  y += 5

  const dashLine = () => {
    doc.text('-'.repeat(46), centerX, y, { align: 'center' })
    y += lineHeight
  }
  dashLine()

  doc.setFontSize(8)
  const dateLabel = input.createdAt.toLocaleDateString('es-AR')
  const timeLabel = input.createdAt.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  doc.text(`Fecha: ${dateLabel} ${timeLabel}`, MARGIN_MM, y)
  doc.text(`Venta #${input.saleId}`, PAGE_WIDTH_MM - MARGIN_MM, y, { align: 'right' })
  y += lineHeight
  if (input.customerName) {
    doc.text(`Cliente: ${input.customerName}`, MARGIN_MM, y)
    y += lineHeight
  }
  dashLine()

  for (const item of input.items) {
    const label = item.variant ? `${item.name} (${item.variant})` : item.name
    doc.text(truncate(label, 40), MARGIN_MM, y)
    y += lineHeight
    const lineTotal = item.unitPrice * item.quantity
    doc.text(
      `  ${item.quantity} x ${formatCurrency(item.unitPrice)}`,
      MARGIN_MM,
      y,
    )
    doc.text(formatCurrency(lineTotal), PAGE_WIDTH_MM - MARGIN_MM, y, { align: 'right' })
    y += lineHeight
  }
  dashLine()

  doc.text('Subtotal', MARGIN_MM, y)
  doc.text(formatCurrency(input.subtotal), PAGE_WIDTH_MM - MARGIN_MM, y, { align: 'right' })
  y += lineHeight

  if (input.promotionDiscount > 0) {
    doc.text('Descuento promoción', MARGIN_MM, y)
    doc.text(`-${formatCurrency(input.promotionDiscount)}`, PAGE_WIDTH_MM - MARGIN_MM, y, {
      align: 'right',
    })
    y += lineHeight
  }
  if (input.discount > 0) {
    doc.text('Descuento', MARGIN_MM, y)
    doc.text(`-${formatCurrency(input.discount)}`, PAGE_WIDTH_MM - MARGIN_MM, y, {
      align: 'right',
    })
    y += lineHeight
  }

  dashLine()
  doc.setFontSize(11)
  doc.setFont('courier', 'bold')
  doc.text('TOTAL', MARGIN_MM, y)
  doc.text(formatCurrency(input.total), PAGE_WIDTH_MM - MARGIN_MM, y, { align: 'right' })
  y += lineHeight + 2

  doc.setFontSize(8)
  doc.setFont('courier', 'normal')
  dashLine()
  doc.text('¡Gracias por su compra!', centerX, y, { align: 'center' })
  y += lineHeight
  doc.text('Este comprobante no es una factura', centerX, y, { align: 'center' })

  return doc
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export function downloadReceiptPdf(input: ReceiptInput): void {
  const doc = buildReceiptPdf(input)
  doc.save(`recibo-venta-${input.saleId}.pdf`)
}
