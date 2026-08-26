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

export interface PaymentMethodBreakdown {
  payment_method_id: number
  name: string
  sales_amount: number
  purchases_amount: number
  expenses_amount: number
  exchanges_amount: number
}

export interface DailySeriesPoint {
  date: string
  sales: number
  purchases: number
  expenses: number
}

export interface FinancialSummary {
  start_date: string
  end_date: string
  sales_total: number
  purchases_total: number
  expenses_total: number
  net_cash_balance: number
  payment_method_breakdown: PaymentMethodBreakdown[]
  daily_series: DailySeriesPoint[]
}

export const reportApi = {
  getDailyBalance: (branchId: number) =>
    apiClient.get<DailyBalance[]>(`/branches/${branchId}/daily-balance`),
  getFinancialSummary: (startDate: string, endDate: string, branchId?: number | null) => {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
    if (branchId != null) params.set('branch_id', String(branchId))
    return apiClient.get<FinancialSummary>(`/reports/financial-summary?${params.toString()}`)
  },
}
