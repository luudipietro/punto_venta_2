import { apiClient } from '@/api/client'

export interface DailyBalance {
  date: string
  sales_cash_total: number
  sales_total: number
  expenses_cash_total: number
  purchases_cash_total: number
  exchanges_cash_total: number
  balance: number
}

export const reportApi = {
  getDailyBalance: (branchId: number) =>
    apiClient.get<DailyBalance[]>(`/branches/${branchId}/daily-balance`),
}
