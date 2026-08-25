import { apiClient } from '@/api/client'

export interface ExchangeItemInput {
  stock_id: number
  quantity: number
  unit_price: number
}

export interface ExchangePaymentInput {
  payment_method_id: number
  /** Positive = customer pays more, negative = refund. */
  amount: number
}

export interface ExchangeCreate {
  sale_id: number
  returned_items: ExchangeItemInput[]
  new_items?: ExchangeItemInput[]
  payments?: ExchangePaymentInput[]
  /** Waives a customer-favorable balance (returned > new) instead of
   * requiring a matching negative payment — the true balance is still
   * computed and shown, it just isn't required to be "paid". */
  waive_refund?: boolean
}

export interface ExchangeReturnItemRead {
  id: number
  exchange_id: number
  stock_id: number
  quantity: number
  unit_price: number
}

export interface ExchangeNewItemRead {
  id: number
  exchange_id: number
  stock_id: number
  quantity: number
  unit_price: number
}

export interface ExchangePaymentRead {
  id: number
  exchange_id: number
  payment_method_id: number
  amount: number
}

export interface ExchangeRead {
  id: number
  sale_id: number
  branch_id: number
  created_at: string
  cancelled_at: string | null
}

export interface ExchangeDetailRead extends ExchangeRead {
  returned_items: ExchangeReturnItemRead[]
  new_items: ExchangeNewItemRead[]
  payments: ExchangePaymentRead[]
  /** new_total - returned_total: positive = customer owed more, negative =
   * store owes the customer (a refund, unless waived). */
  balance: number
}

export const exchangeApi = {
  list: () => apiClient.get<ExchangeRead[]>('/exchanges'),
  getById: (id: number) => apiClient.get<ExchangeDetailRead>(`/exchanges/${id}`),
  create: (payload: ExchangeCreate) => apiClient.post<ExchangeDetailRead>('/exchanges', payload),
  cancel: (id: number) => apiClient.post<ExchangeRead>(`/exchanges/${id}/cancel`),
}
