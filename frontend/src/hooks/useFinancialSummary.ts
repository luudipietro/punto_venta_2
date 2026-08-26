import { useQuery } from '@tanstack/react-query'
import { reportApi } from '@/api/report'

export function useFinancialSummary(
  startDate: string,
  endDate: string,
  branchId: number | null,
) {
  return useQuery({
    queryKey: ['financial-summary', startDate, endDate, branchId],
    queryFn: () => reportApi.getFinancialSummary(startDate, endDate, branchId),
    enabled: Boolean(startDate && endDate),
  })
}
