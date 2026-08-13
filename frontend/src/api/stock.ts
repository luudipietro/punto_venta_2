import { apiClient } from '@/api/client'
import { createCrudApi } from '@/api/base'

export interface Stock {
  id: number
  product_id: number
  color_id: number | null
  size_id: number | null
  branch_id: number
  quantity: number
}

export interface StockInput {
  product_id: number
  color_id?: number | null
  size_id?: number | null
  branch_id: number
  quantity: number
}

export const stockApi = {
  ...createCrudApi<Stock, StockInput>('stocks'),
  increase: (id: number, amount: number) =>
    apiClient.post<Stock>(`/stocks/${id}/increase`, { amount }),
  decrease: (id: number, amount: number) =>
    apiClient.post<Stock>(`/stocks/${id}/decrease`, { amount }),
}
