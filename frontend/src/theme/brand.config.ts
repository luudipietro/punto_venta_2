/**
 * Single source of truth for client-specific branding.
 *
 * To white-label the app for a different client: edit the values below (and
 * swap the file referenced by `logoUrl`, e.g. drop a new file in
 * `public/brand/logo.svg`). Nothing else in the codebase should hardcode a
 * company name, logo path, or brand color — every screen reads from here.
 *
 * These are the *factory defaults* — an admin can override any of them at
 * runtime via Configuración de marca (`BrandSettingsPage.tsx`, backed by
 * `BrandSettings.colors`); see `ThemeProvider.tsx`'s `applyTheme`, which
 * merges a DB override on top of these defaults token-by-token.
 */
export interface BrandColorSet {
  background: string
  foreground: string
  card: string
  cardForeground: string
  /** Primary brand color — buttons, active nav item, links. */
  primary: string
  /** Text/icon color placed on top of `primary`. */
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  border: string
  ring: string
}

export interface BrandConfig {
  companyName: string
  /** Path under /public, or an absolute URL. */
  logoUrl: string
  colors: {
    light: BrandColorSet
    dark: BrandColorSet
  }
}

// Copied verbatim from index.css's :root/.dark blocks — those stay the
// canonical "what does an unconfigured app look like" source, this file
// just mirrors them so they're also available as JS values (for jsPDF color
// resolution and as the BrandSettingsPage color pickers' starting point).
export const brandConfig: BrandConfig = {
  companyName: 'Punto de Venta',
  logoUrl: '/brand/logo.svg',
  colors: {
    light: {
      background: 'oklch(1 0 0)',
      foreground: 'oklch(0.145 0 0)',
      card: 'oklch(1 0 0)',
      cardForeground: 'oklch(0.145 0 0)',
      primary: 'oklch(0.205 0 0)',
      primaryForeground: 'oklch(0.985 0 0)',
      secondary: 'oklch(0.97 0 0)',
      secondaryForeground: 'oklch(0.205 0 0)',
      muted: 'oklch(0.97 0 0)',
      mutedForeground: 'oklch(0.556 0 0)',
      accent: 'oklch(0.97 0 0)',
      accentForeground: 'oklch(0.205 0 0)',
      border: 'oklch(0.922 0 0)',
      ring: 'oklch(0.708 0 0)',
    },
    dark: {
      background: 'oklch(0.145 0 0)',
      foreground: 'oklch(0.985 0 0)',
      card: 'oklch(0.205 0 0)',
      cardForeground: 'oklch(0.985 0 0)',
      primary: 'oklch(0.922 0 0)',
      primaryForeground: 'oklch(0.205 0 0)',
      secondary: 'oklch(0.269 0 0)',
      secondaryForeground: 'oklch(0.985 0 0)',
      muted: 'oklch(0.269 0 0)',
      mutedForeground: 'oklch(0.708 0 0)',
      accent: 'oklch(0.269 0 0)',
      accentForeground: 'oklch(0.985 0 0)',
      border: 'oklch(1 0 0 / 10%)',
      ring: 'oklch(0.556 0 0)',
    },
  },
}
