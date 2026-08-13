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
}

export interface ExchangeDetailRead extends ExchangeRead {
  returned_items: ExchangeReturnItemRead[]
  new_items: ExchangeNewItemRead[]
  payments: ExchangePaymentRead[]
}

export const exchangeApi = {
  list: () => apiClient.get<ExchangeRead[]>('/exchanges'),
  getById: (id: number) => apiClient.get<ExchangeDetailRead>(`/exchanges/${id}`),
  create: (payload: ExchangeCreate) => apiClient.post<ExchangeDetailRead>('/exchanges', payload),
}
