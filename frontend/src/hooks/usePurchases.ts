import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { purchaseApi, type PurchasePayInput } from '@/api/purchase'

export function usePurchases() {
  return useQuery({ queryKey: ['purchases'], queryFn: purchaseApi.list })
}

export function usePurchase(id: number | undefined) {
  return useQuery({
    queryKey: ['purchases', id],
    queryFn: () => purchaseApi.getById(id as number),
    enabled: id !== undefined,
  })
}

export function useCreatePurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: purchaseApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['stocks'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function usePayPurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: PurchasePayInput }) =>
      purchaseApi.pay(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['purchases', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['daily-balance'] })
    },
  })
}

export function useCancelPurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => purchaseApi.cancel(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['purchases', id] })
      queryClient.invalidateQueries({ queryKey: ['stocks'] })
      queryClient.invalidateQueries({ queryKey: ['daily-balance'] })
    },
  })
}
