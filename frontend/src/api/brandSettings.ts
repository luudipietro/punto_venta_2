import { apiClient } from '@/api/client'

/** Mirrors `app/schemas/brand_settings_schema.py`'s `BrandColorSet` — snake_case,
 * same convention as every other API type in this codebase (e.g. `unit_price`). */
export interface ApiColorSet {
  background: string
  foreground: string
  card: string
  card_foreground: string
  primary: string
  primary_foreground: string
  secondary: string
  secondary_foreground: string
  muted: string
  muted_foreground: string
  accent: string
  accent_foreground: string
  border: string
  ring: string
}

export interface ApiColors {
  light: ApiColorSet
  dark: ApiColorSet
}

export interface BrandSettings {
  company_name: string
  logo_url: string
  colors?: ApiColors | null
  whatsapp_number?: string | null
}

export const brandSettingsApi = {
  get: () => apiClient.get<BrandSettings>('/brand-settings'),
  update: (payload: BrandSettings) => apiClient.put<BrandSettings>('/brand-settings', payload),
}
