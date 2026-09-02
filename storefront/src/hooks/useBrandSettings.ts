import { useQuery } from '@tanstack/react-query'
import { brandSettingsApi } from '@/api/brandSettings'

export function useBrandSettings() {
  // Rarely changes — a long staleTime avoids a refetch-on-every-mount for
  // something that's effectively static branding.
  return useQuery({
    queryKey: ['brand-settings'],
    queryFn: brandSettingsApi.get,
    staleTime: 5 * 60 * 1000,
  })
}
