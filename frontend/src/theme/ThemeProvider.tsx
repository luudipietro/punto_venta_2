import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { brandConfig, type BrandColorSet } from '@/theme/brand.config'
import { useBrandSettings } from '@/hooks/useBrandSettings'
import { fromApiColorSet } from '@/lib/color'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'pos-theme'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Applies the light/dark class and every brand color token for that mode —
 * `overrides` (an admin's BrandSettings.colors, if configured) wins
 * token-by-token over `brandConfig.colors[theme]`'s factory defaults. */
function applyTheme(theme: Theme, overrides: BrandColorSet | null) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')

  const colors = { ...brandConfig.colors[theme], ...overrides }
  root.style.setProperty('--background', colors.background)
  root.style.setProperty('--foreground', colors.foreground)
  root.style.setProperty('--card', colors.card)
  root.style.setProperty('--card-foreground', colors.cardForeground)
  root.style.setProperty('--primary', colors.primary)
  root.style.setProperty('--primary-foreground', colors.primaryForeground)
  root.style.setProperty('--secondary', colors.secondary)
  root.style.setProperty('--secondary-foreground', colors.secondaryForeground)
  root.style.setProperty('--muted', colors.muted)
  root.style.setProperty('--muted-foreground', colors.mutedForeground)
  root.style.setProperty('--accent', colors.accent)
  root.style.setProperty('--accent-foreground', colors.accentForeground)
  root.style.setProperty('--border', colors.border)
  root.style.setProperty('--ring', colors.ring)
  root.style.setProperty('--sidebar-primary', colors.primary)
  root.style.setProperty('--sidebar-primary-foreground', colors.primaryForeground)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const { data: brand } = useBrandSettings()
  const apiOverride = brand?.colors?.[theme]
  const overrides = useMemo(
    () => (apiOverride ? fromApiColorSet(apiOverride) : null),
    [apiOverride],
  )

  useEffect(() => {
    applyTheme(theme, overrides)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme, overrides])

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
