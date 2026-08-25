import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { brandSettingsApi } from '@/api/brandSettings'

/** Plain query/mutation, not `createCrudHooks` — this is a singleton
 * resource, not a list. */
export function useBrandSettings() {
  return useQuery({ queryKey: ['brand-settings'], queryFn: brandSettingsApi.get })
}

export function useUpdateBrandSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: brandSettingsApi.update,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-settings'] }),
  })
}
