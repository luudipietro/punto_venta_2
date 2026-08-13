import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { saleApi } from '@/api/sale'

export function useSales() {
  return useQuery({ queryKey: ['sales'], queryFn: saleApi.list })
}

export function useSale(id: number | undefined) {
  return useQuery({
    queryKey: ['sales', id],
    queryFn: () => saleApi.getById(id as number),
    enabled: id !== undefined,
  })
}

export function useCreateSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saleApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['stocks'] })
    },
  })
}

/** Not a `useQuery` on purpose: the caller (the POS cart) triggers it
 * explicitly, debounced, as items/discount change — polling or auto-refetch
 * semantics don't fit a "preview this exact cart" call. */
export function usePreviewSale() {
  return useMutation({ mutationFn: saleApi.preview })
}

export function useCancelSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saleApi.cancel,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales', id] })
      queryClient.invalidateQueries({ queryKey: ['stocks'] })
      queryClient.invalidateQueries({ queryKey: ['daily-balance'] })
    },
  })
}
