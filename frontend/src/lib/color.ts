import type { BrandColorSet } from '@/theme/brand.config'
import type { ApiColorSet } from '@/api/brandSettings'

/** Converts between the API's snake_case `BrandColorSet`/`ApiColorSet` wire
 * shape (mirrors `app/schemas/brand_settings_schema.py`) and the frontend's
 * camelCase `BrandColorSet` (the established convention in
 * `theme/brand.config.ts`) — used at the boundary of
 * `ThemeProvider.tsx`/`BrandSettingsPage.tsx`. */
export function fromApiColorSet(colors: ApiColorSet): BrandColorSet {
  return {
    background: colors.background,
    foreground: colors.foreground,
    card: colors.card,
    cardForeground: colors.card_foreground,
    primary: colors.primary,
    primaryForeground: colors.primary_foreground,
    secondary: colors.secondary,
    secondaryForeground: colors.secondary_foreground,
    muted: colors.muted,
    mutedForeground: colors.muted_foreground,
    accent: colors.accent,
    accentForeground: colors.accent_foreground,
    border: colors.border,
    ring: colors.ring,
  }
}

export function toApiColorSet(colors: BrandColorSet): ApiColorSet {
  return {
    background: colors.background,
    foreground: colors.foreground,
    card: colors.card,
    card_foreground: colors.cardForeground,
    primary: colors.primary,
    primary_foreground: colors.primaryForeground,
    secondary: colors.secondary,
    secondary_foreground: colors.secondaryForeground,
    muted: colors.muted,
    muted_foreground: colors.mutedForeground,
    accent: colors.accent,
    accent_foreground: colors.accentForeground,
    border: colors.border,
    ring: colors.ring,
  }
}

/** Resolves any CSS color (including modern syntaxes like oklch(), which
 * jsPDF/<input type="color"> have no idea how to parse) to an RGB triplet by
 * letting the browser do the conversion — painted onto a 1x1 canvas and read
 * back as actual pixel bytes, not via `getComputedStyle`. Newer Chromium
 * versions echo `getComputedStyle(...).color` back as the same `oklch(...)`
 * string instead of normalizing it to `rgb(...)`, which silently produced
 * wrong colors (e.g. white resolved as near-black) — a real bug found while
 * testing the brand color picker. Reading the actual rendered pixel sidesteps
 * that: canvas always rasterizes to concrete sRGB bytes. */
export function resolveColorRgb(cssColor: string): [number, number, number] {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return [30, 30, 30]
  ctx.fillStyle = cssColor
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

/** Same resolution trick as `resolveColorRgb`, formatted as `#rrggbb` — used
 * to seed `<input type="color">` (which only accepts hex) with the current
 * effective color, even when that color is an oklch() default. */
export function cssColorToHex(cssColor: string): string {
  const [r, g, b] = resolveColorRgb(cssColor)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
