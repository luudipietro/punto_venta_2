import { useMutation, useQueryClient } from '@tanstack/react-query'
import { stockApi } from '@/api/stock'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: useStocks,
  useGetById: useStock,
  useCreate: useCreateStock,
  useUpdate: useUpdateStock,
  useRemove: useDeleteStock,
} = createCrudHooks('stocks', stockApi)

export function useIncreaseStock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) => stockApi.increase(id, amount),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stocks'] }),
  })
}

export function useDecreaseStock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) => stockApi.decrease(id, amount),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stocks'] }),
  })
}
