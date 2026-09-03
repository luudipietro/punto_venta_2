import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ApiColorSet, ApiColors } from '@/api/brandSettings'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'storefront-theme'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

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

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Applies the admin-configured brand colors (or the factory defaults) as
 * CSS custom properties — defaults to the OS light/dark preference on first
 * visit, then remembers a manual toggle (see `Navbar.tsx`'s sun/moon
 * button) the same way the admin app's own `ThemeProvider` does. */
export function ThemeProvider({
  colors,
  children,
}: {
  colors: ApiColors | null | undefined
  children: ReactNode
}) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme, colors?.[theme])
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme, colors])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
