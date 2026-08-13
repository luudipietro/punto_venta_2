/**
 * Single source of truth for client-specific branding.
 *
 * To white-label the app for a different client: edit the values below (and
 * swap the file referenced by `logoUrl`, e.g. drop a new file in
 * `public/brand/logo.svg`). Nothing else in the codebase should hardcode a
 * company name, logo path, or brand color — every screen reads from here.
 */
export interface BrandColorSet {
  /** Primary brand color — buttons, active nav item, links. */
  primary: string
  /** Text/icon color placed on top of `primary`. */
  primaryForeground: string
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

export const brandConfig: BrandConfig = {
  companyName: 'Punto de Venta',
  logoUrl: '/brand/logo.svg',
  colors: {
    light: {
      primary: 'oklch(0.205 0 0)',
      primaryForeground: 'oklch(0.985 0 0)',
    },
    dark: {
      primary: 'oklch(0.922 0 0)',
      primaryForeground: 'oklch(0.205 0 0)',
    },
  },
}
