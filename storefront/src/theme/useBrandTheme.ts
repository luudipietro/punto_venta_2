import { useEffect } from 'react'
import type { ApiColorSet, ApiColors } from '@/api/brandSettings'

type Theme = 'light' | 'dark'

// Factory defaults — kept in sync by hand with the light/dark oklch() values
// in index.css (which is also the admin frontend's own default), same as
// the admin's `theme/brand.config.ts`. An admin's `BrandSettings.colors`
// override (already stored as hex from the color pickers) wins token-by-
// token over these.
const DEFAULTS: ApiColors = {
  light: {
    background: 'oklch(1 0 0)',
    foreground: 'oklch(0.145 0 0)',
    card: 'oklch(1 0 0)',
    card_foreground: 'oklch(0.145 0 0)',
    primary: 'oklch(0.205 0 0)',
    primary_foreground: 'oklch(0.985 0 0)',
    secondary: 'oklch(0.97 0 0)',
    secondary_foreground: 'oklch(0.205 0 0)',
    muted: 'oklch(0.97 0 0)',
    muted_foreground: 'oklch(0.556 0 0)',
    accent: 'oklch(0.97 0 0)',
    accent_foreground: 'oklch(0.205 0 0)',
    border: 'oklch(0.922 0 0)',
    ring: 'oklch(0.708 0 0)',
  },
  dark: {
    background: 'oklch(0.145 0 0)',
    foreground: 'oklch(0.985 0 0)',
    card: 'oklch(0.205 0 0)',
    card_foreground: 'oklch(0.985 0 0)',
    primary: 'oklch(0.922 0 0)',
    primary_foreground: 'oklch(0.205 0 0)',
    secondary: 'oklch(0.269 0 0)',
    secondary_foreground: 'oklch(0.985 0 0)',
    muted: 'oklch(0.269 0 0)',
    muted_foreground: 'oklch(0.708 0 0)',
    accent: 'oklch(0.269 0 0)',
    accent_foreground: 'oklch(0.985 0 0)',
    border: 'oklch(1 0 0 / 10%)',
    ring: 'oklch(0.556 0 0)',
  },
}

const TOKENS = Object.keys(DEFAULTS.light) as (keyof ApiColorSet)[]

function cssVarName(token: keyof ApiColorSet): string {
  return `--${token.replace(/_/g, '-')}`
}

function applyTheme(theme: Theme, overrides: ApiColorSet | undefined) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  const colors = { ...DEFAULTS[theme], ...overrides }
  for (const token of TOKENS) {
    root.style.setProperty(cssVarName(token), colors[token])
  }
}

/** Applies the admin-configured brand colors (or the factory defaults) as
 * CSS custom properties, following the OS light/dark preference — the
 * storefront has no manual theme toggle, unlike the admin app. */
export function useBrandTheme(colors: ApiColors | null | undefined) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      const theme: Theme = media.matches ? 'dark' : 'light'
      applyTheme(theme, colors?.[theme])
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [colors])
}
