import { jsPDF } from 'jspdf'
import { formatCurrencyNoCents } from '@/lib/format'
import { resolveColorRgb } from '@/lib/color'
import { brandConfig } from '@/theme/brand.config'

export interface PriceTagItem {
  name: string
  price: number
  /** Pre-discount price, if a promotion was applied — rendered struck
   * through above the final `price`. */
  originalPrice?: number
  detail?: string
  copies: number
}

export interface SheetLayout {
  key: string
  label: string
  rows: number
  cols: number
}

export const SHEET_LAYOUTS: SheetLayout[] = [
  { key: '1', label: 'A4 completo (1 por hoja)', rows: 1, cols: 1 },
  { key: '2', label: 'Horizontal (2 por hoja)', rows: 2, cols: 1 },
  { key: '3', label: 'A6 clásico (4 por hoja)', rows: 2, cols: 2 },
  { key: '4', label: 'Chico (16 por hoja)', rows: 4, cols: 4 },
]

export interface PriceTagsInput {
  companyName: string
  logoUrl: string | null
  layout: SheetLayout
  items: PriceTagItem[]
  /** Overrides `brandConfig.colors.light.primary` for the price color —
   * lets the admin's configured brand color (BrandSettings.colors) show up
   * on printed tags without touching the current UI theme. */
  primaryColor?: string
}

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
/** jsPDF's `setFontSize` always takes points, regardless of the document's
 * unit — every "size" value in this file is in mm (like every other
 * measurement here), and gets converted to pt only at the two points that
 * actually call into jsPDF's font APIs (`textWidth` and `drawFooter`).
 * Missing this conversion was a real bug: text rendered ~2.8x smaller than
 * intended (mm-scale numbers fed directly as pt sizes), making every tag
 * look tiny with huge unused margins regardless of sheet size. */
const MM_TO_PT = 2.8346456693

const FONT_FAMILY_FALLBACK = 'helvetica'
let fontFamily: string | null = null

/** Loads the two bundled Poppins weights into jsPDF's virtual filesystem so
 * tags look intentional rather than a generic PDF — falls back to jsPDF's
 * built-in Helvetica if the fetch/registration fails for any reason (offline,
 * blocked request, etc.), same never-break-the-generator philosophy as the
 * reference Python script this feature is based on. */
async function ensureFontsLoaded(doc: jsPDF): Promise<string> {
  if (fontFamily) return fontFamily
  try {
    const [boldBase64, mediumBase64] = await Promise.all([
      fetchAsBase64('/fonts/Poppins-Bold.ttf'),
      fetchAsBase64('/fonts/Poppins-Medium.ttf'),
    ])
    doc.addFileToVFS('Poppins-Bold.ttf', boldBase64)
    doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold')
    doc.addFileToVFS('Poppins-Medium.ttf', mediumBase64)
    doc.addFont('Poppins-Medium.ttf', 'Poppins', 'normal')
    fontFamily = 'Poppins'
  } catch {
    fontFamily = FONT_FAMILY_FALLBACK
  }
  return fontFamily
}

async function fetchAsBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`No se pudo cargar ${url}`)
  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** Rasterizes a (possibly SVG) logo onto an offscreen canvas so jsPDF —
 * which can't place SVG directly — can embed it as a PNG. Resolves to null
 * on any failure so a broken/missing logo just gets skipped, same
 * graceful-degradation convention used for product images elsewhere. */
function rasterizeLogo(url: string): Promise<{ dataUrl: string; ratio: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || 200
        canvas.height = img.naturalHeight || 200
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve({ dataUrl: canvas.toDataURL('image/png'), ratio: canvas.width / canvas.height })
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function textWidth(doc: jsPDF, text: string, style: 'normal' | 'bold', sizeMm: number): number {
  doc.setFont(fontFamily ?? FONT_FAMILY_FALLBACK, style)
  doc.setFontSize(sizeMm * MM_TO_PT)
  return doc.getTextWidth(text)
}

function setFontSizeMm(doc: jsPDF, sizeMm: number): void {
  doc.setFontSize(sizeMm * MM_TO_PT)
}

function wrapLines(
  doc: jsPDF,
  words: string[],
  style: 'normal' | 'bold',
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const trial = (current + ' ' + word).trim()
    if (textWidth(doc, trial, style, size) <= maxWidth) {
      current = trial
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function splitByChars(
  doc: jsPDF,
  text: string,
  style: 'normal' | 'bold',
  size: number,
  maxWidth: number,
): string[] {
  const parts: string[] = []
  let current = ''
  for (const ch of text) {
    const trial = current + ch
    if (current === '' || textWidth(doc, trial, style, size) <= maxWidth) {
      current = trial
    } else {
      parts.push(current)
      current = ch
    }
  }
  if (current) parts.push(current)
  return parts
}

function maxLineWidth(doc: jsPDF, lines: string[], style: 'normal' | 'bold', size: number): number {
  if (!lines.length) return 0
  return Math.max(...lines.map((line) => textWidth(doc, line, style, size)))
}

/** Shrinks the font until the text fits within `maxLines`/`maxWidth`
 * (never breaking a word mid-way if avoidable), and only as a last resort
 * — if even the minimum size can't fit a single word — splits it character
 * by character. Ports `_armar_lineas`/`_partir_por_caracteres` from
 * generador_carteles/generar_carteles.py. */
function fitText(
  doc: jsPDF,
  text: string,
  style: 'normal' | 'bold',
  startSize: number,
  minSize: number,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; size: number } {
  const words = text.split(/\s+/).filter(Boolean)
  let size = startSize
  let lines = wrapLines(doc, words, style, size, maxWidth)
  while (
    (lines.length > maxLines || maxLineWidth(doc, lines, style, size) > maxWidth) &&
    size > minSize
  ) {
    size -= startSize * 0.02
    lines = wrapLines(doc, words, style, size, maxWidth)
  }
  if (maxLineWidth(doc, lines, style, size) > maxWidth) {
    const result: string[] = []
    for (const line of lines) {
      if (textWidth(doc, line, style, size) <= maxWidth) result.push(line)
      else result.push(...splitByChars(doc, line, style, size, maxWidth))
    }
    lines = result
  }
  return { lines: lines.slice(0, maxLines), size }
}

interface DrawContext {
  doc: jsPDF
  companyName: string
  logo: { dataUrl: string; ratio: number } | null
  priceRgb: [number, number, number]
  borderRgb: [number, number, number]
}

function drawFooter(ctx: DrawContext, cx: number, y: number, maxWidth: number, refSizeMm: number) {
  const { doc, companyName, logo } = ctx
  let sizeMm = Math.max(2.1, refSizeMm)
  doc.setFont(fontFamily ?? FONT_FAMILY_FALLBACK, 'bold')
  setFontSizeMm(doc, sizeMm)
  let width = doc.getTextWidth(companyName)
  let logoSize = sizeMm * 0.9
  let gap = logo ? sizeMm * 0.35 : 0
  while (width + logoSize + gap > maxWidth && sizeMm > 1.8) {
    sizeMm -= 0.15
    setFontSizeMm(doc, sizeMm)
    width = doc.getTextWidth(companyName)
    logoSize = sizeMm * 0.9
    gap = logo ? sizeMm * 0.35 : 0
  }
  const totalWidth = width + (logo ? logoSize + gap : 0)
  let x = cx - totalWidth / 2
  if (logo) {
    const h = logoSize
    const w = logoSize * logo.ratio
    doc.addImage(logo.dataUrl, 'PNG', x, y - h * 0.75, Math.min(w, logoSize * 1.6), h)
    x += logoSize + gap
  }
  doc.setTextColor(40, 40, 40)
  doc.text(companyName, x, y)
}

function separator(doc: jsPDF, x1: number, x2: number, y: number, rgb: [number, number, number]) {
  doc.setDrawColor(...rgb)
  doc.setLineWidth(0.35)
  doc.line(x1, y, x2, y)
}

/** Draws a promotion's pre-discount price struck through — jsPDF has no
 * `text-decoration`, so the line is drawn manually across the text's own
 * measured width. */
function drawStrikePrice(doc: jsPDF, text: string, cx: number, y: number, sizeMm: number) {
  doc.setTextColor(120, 120, 120)
  doc.setFont(fontFamily ?? FONT_FAMILY_FALLBACK, 'normal')
  setFontSizeMm(doc, sizeMm)
  doc.text(text, cx, y, { align: 'center' })
  const w = doc.getTextWidth(text)
  doc.setDrawColor(120, 120, 120)
  doc.setLineWidth(0.3)
  doc.line(cx - w / 2, y - sizeMm * 0.32, cx + w / 2, y - sizeMm * 0.32)
}

/** All "size" values below are millimeters, like every other measurement in
 * this file (see the `MM_TO_PT` note above) — `fitText`/`textWidth` and
 * `setFontSizeMm` are what convert them to points at the jsPDF boundary. */
function drawTag(
  ctx: DrawContext,
  x0: number,
  y0: number,
  width: number,
  height: number,
  item: PriceTagItem,
) {
  const { doc, borderRgb, priceRgb } = ctx
  const vertical = width <= height
  const ref = vertical ? width : height

  doc.setDrawColor(...borderRgb)
  doc.setLineWidth(1.1)
  const margin = Math.min(width, height) * 0.035
  doc.rect(x0 + margin, y0 + margin, width - 2 * margin, height - 2 * margin)

  const cx = x0 + width / 2
  const lineX1 = x0 + width * 0.14
  const lineX2 = x0 + width - width * 0.14

  if (vertical) {
    const maxTextWidth = width * 0.86

    drawFooter(ctx, cx, y0 + height * 0.09, width * 0.88, ref * 0.05)
    separator(doc, lineX1, lineX2, y0 + height * 0.15, borderRgb)

    const { lines: nameLines, size: nameSize } = fitText(
      doc,
      item.name.toUpperCase(),
      'bold',
      ref * 0.15,
      ref * 0.055,
      maxTextWidth,
      2,
    )
    doc.setTextColor(20, 20, 20)
    const nameGap = nameSize * 1.18
    let y = y0 + height * 0.29
    for (const line of nameLines) {
      doc.setFont(fontFamily ?? FONT_FAMILY_FALLBACK, 'bold')
      setFontSizeMm(doc, nameSize)
      doc.text(line, cx, y, { align: 'center' })
      y += nameGap
    }

    const hasPromo = item.originalPrice !== undefined && item.originalPrice > item.price
    const priceY = y0 + height * (nameLines.length > 1 ? 0.62 : 0.56) + (hasPromo ? height * 0.04 : 0)
    const priceText = formatCurrencyNoCents(item.price)
    let priceSize = width * 0.3
    while (
      textWidth(doc, priceText, 'bold', priceSize) > width * 0.88 &&
      priceSize > ref * 0.08
    ) {
      priceSize -= priceSize * 0.03
    }
    if (hasPromo) {
      const strikeSize = Math.max(ref * 0.07, priceSize * 0.35)
      drawStrikePrice(doc, formatCurrencyNoCents(item.originalPrice!), cx, priceY - priceSize * 0.85, strikeSize)
    }
    doc.setTextColor(...priceRgb)
    doc.setFont(fontFamily ?? FONT_FAMILY_FALLBACK, 'bold')
    setFontSizeMm(doc, priceSize)
    doc.text(priceText, cx, priceY, { align: 'center' })

    const lowerLineY = y0 + height * (item.detail ? 0.78 : 0.86)
    separator(doc, lineX1, lineX2, lowerLineY, borderRgb)

    if (item.detail) {
      doc.setTextColor(90, 90, 90)
      doc.setFont(fontFamily ?? FONT_FAMILY_FALLBACK, 'normal')
      const detailSize = Math.max(ref * 0.038, 2.4)
      setFontSizeMm(doc, detailSize)
      doc.text(
        truncateToWidth(doc, item.detail, 'normal', detailSize, width * 0.82),
        cx,
        lowerLineY + height * 0.045,
        { align: 'center' },
      )
    }
  } else {
    const colGap = width * 0.045
    const leftMax = width * 0.5 - colGap
    const rightX = x0 + width * 0.55
    const rightMax = width * 0.42

    doc.setDrawColor(...borderRgb)
    doc.setLineWidth(0.35)
    doc.line(x0 + width * 0.51, y0 + height * 0.16, x0 + width * 0.51, y0 + height * 0.84)

    drawFooter(ctx, cx, y0 + height * 0.12, width * 0.5, ref * 0.075)

    const { lines: nameLines, size: nameSize } = fitText(
      doc,
      item.name.toUpperCase(),
      'bold',
      ref * 0.22,
      ref * 0.07,
      leftMax,
      3,
    )
    const nameGap = nameSize * 1.15
    const blockHeight = (nameLines.length - 1) * nameGap
    let y = y0 + height * 0.56 - blockHeight / 2
    doc.setTextColor(20, 20, 20)
    for (const line of nameLines) {
      doc.setFont(fontFamily ?? FONT_FAMILY_FALLBACK, 'bold')
      setFontSizeMm(doc, nameSize)
      doc.text(line, x0 + width * 0.26, y, { align: 'center' })
      y += nameGap
    }
    if (item.detail) {
      doc.setTextColor(90, 90, 90)
      const detailSize = Math.max(ref * 0.06, 2.6)
      doc.setFont(fontFamily ?? FONT_FAMILY_FALLBACK, 'normal')
      setFontSizeMm(doc, detailSize)
      doc.text(
        truncateToWidth(doc, item.detail, 'normal', detailSize, leftMax),
        x0 + width * 0.26,
        y0 + height * 0.82,
        { align: 'center' },
      )
    }

    const hasPromo = item.originalPrice !== undefined && item.originalPrice > item.price
    const priceText = formatCurrencyNoCents(item.price)
    let priceSize = height * (hasPromo ? 0.38 : 0.44)
    while (
      textWidth(doc, priceText, 'bold', priceSize) > rightMax &&
      priceSize > ref * 0.1
    ) {
      priceSize -= priceSize * 0.03
    }
    const priceY = y0 + height * (hasPromo ? 0.6 : 0.56)
    if (hasPromo) {
      const strikeSize = Math.max(ref * 0.08, priceSize * 0.4)
      drawStrikePrice(
        doc,
        formatCurrencyNoCents(item.originalPrice!),
        rightX + rightMax / 2,
        priceY - priceSize * 0.9,
        strikeSize,
      )
    }
    doc.setTextColor(...priceRgb)
    doc.setFont(fontFamily ?? FONT_FAMILY_FALLBACK, 'bold')
    setFontSizeMm(doc, priceSize)
    doc.text(priceText, rightX + rightMax / 2, priceY, { align: 'center' })
  }
}

function truncateToWidth(
  doc: jsPDF,
  text: string,
  style: 'normal' | 'bold',
  size: number,
  maxWidth: number,
): string {
  if (textWidth(doc, text, style, size) <= maxWidth) return text
  let truncated = text
  while (truncated.length > 1 && textWidth(doc, `${truncated}…`, style, size) > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated}…`
}

export async function buildPriceTagsPdf(input: PriceTagsInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await ensureFontsLoaded(doc)

  const logo = input.logoUrl ? await rasterizeLogo(input.logoUrl) : null
  // Always resolved against the *light* primary (default or admin-configured
  // via BrandSettings.colors) so a printed tag looks the same regardless of
  // whether the shop currently has the UI in dark mode.
  const priceRgb = resolveColorRgb(input.primaryColor ?? brandConfig.colors.light.primary)
  const borderRgb: [number, number, number] = [140, 140, 140]

  const ctx: DrawContext = { doc, companyName: input.companyName, logo, priceRgb, borderRgb }

  const { rows, cols } = input.layout
  const perSheet = rows * cols
  const tagWidth = A4_WIDTH_MM / cols
  const tagHeight = A4_HEIGHT_MM / rows

  const expanded: PriceTagItem[] = []
  for (const item of input.items) {
    for (let i = 0; i < item.copies; i++) expanded.push(item)
  }

  if (expanded.length === 0) {
    return doc
  }

  expanded.forEach((item, index) => {
    const posInSheet = index % perSheet
    if (posInSheet === 0 && index !== 0) {
      doc.addPage()
    }
    const row = Math.floor(posInSheet / cols)
    const col = posInSheet % cols
    const x0 = col * tagWidth
    const y0 = row * tagHeight
    drawTag(ctx, x0, y0, tagWidth, tagHeight, item)
  })

  return doc
}

export async function downloadPriceTagsPdf(input: PriceTagsInput): Promise<void> {
  const doc = await buildPriceTagsPdf(input)
  doc.save(`carteles-precio-${Date.now()}.pdf`)
}
