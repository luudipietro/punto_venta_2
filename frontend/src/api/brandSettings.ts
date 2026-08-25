import { apiClient } from '@/api/client'

export interface BrandSettings {
  company_name: string
  logo_url: string
}

export const brandSettingsApi = {
  get: () => apiClient.get<BrandSettings>('/brand-settings'),
  update: (payload: BrandSettings) => apiClient.put<BrandSettings>('/brand-settings', payload),
}
