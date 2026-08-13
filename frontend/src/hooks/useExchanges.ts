import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { exchangeApi } from '@/api/exchange'

export function useExchanges() {
  return useQuery({ queryKey: ['exchanges'], queryFn: exchangeApi.list })
}

export function useExchange(id: number | undefined) {
  return useQuery({
    queryKey: ['exchanges', id],
    queryFn: () => exchangeApi.getById(id as number),
    enabled: id !== undefined,
  })
}

export function useCreateExchange() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: exchangeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchanges'] })
      queryClient.invalidateQueries({ queryKey: ['stocks'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
    },
  })
}
