import { useQuery } from '@tanstack/react-query'
import { reportApi } from '@/api/report'

export function useDailyBalance(branchId: number | undefined) {
  return useQuery({
    queryKey: ['daily-balance', branchId],
    queryFn: () => reportApi.getDailyBalance(branchId as number),
    enabled: branchId !== undefined,
  })
}
