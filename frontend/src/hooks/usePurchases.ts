import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { purchaseApi } from '@/api/purchase'

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
    },
  })
}
