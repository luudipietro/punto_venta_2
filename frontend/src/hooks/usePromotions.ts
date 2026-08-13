import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { promotionApi, type PromotionCreate } from '@/api/promotion'

export function usePromotions() {
  return useQuery({ queryKey: ['promotions'], queryFn: promotionApi.list })
}

export function usePromotion(id: number | undefined) {
  return useQuery({
    queryKey: ['promotions', id],
    queryFn: () => promotionApi.getById(id as number),
    enabled: id !== undefined,
  })
}

export function useCreatePromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: promotionApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['promotions'] }),
  })
}

export function useUpdatePromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: PromotionCreate }) =>
      promotionApi.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['promotions'] }),
  })
}

export function useDeletePromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: promotionApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['promotions'] }),
  })
}
