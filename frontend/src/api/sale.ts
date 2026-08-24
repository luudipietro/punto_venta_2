import { apiClient } from '@/api/client'

export interface SaleItemInput {
  stock_id: number
  quantity: number
  unit_price: number
}

export interface SalePaymentInput {
  payment_method_id: number
  amount_without_surcharge: number
  amount_with_surcharge: number
}

export interface SaleCreate {
  branch_id: number
  discount?: number
  discount_reason?: string | null
  customer_id?: number | null
  items: SaleItemInput[]
  payments: SalePaymentInput[]
}

export interface SaleItemRead {
  id: number
  sale_id: number
  stock_id: number
  quantity: number
  unit_price: number
  promotion_id: number | null
}

export interface SalePaymentRead {
  id: number
  sale_id: number
  payment_method_id: number
  amount_without_surcharge: number
  amount_with_surcharge: number
}

export interface SaleRead {
  id: number
  branch_id: number
  subtotal: number
  discount: number
  promotion_discount: number
  discount_reason: string | null
  total: number
  created_at: string
  cancelled_at: string | null
  customer_id: number | null
}

export interface SaleDetailRead extends SaleRead {
  items: SaleItemRead[]
  payments: SalePaymentRead[]
}

export interface SaleListRead extends SaleRead {
  items_summary: string
}

/** Same input shape as SaleCreate minus `payments` — nothing is charged yet,
 * this is only used to show live totals/promotions as the cart changes. */
export interface SalePreviewInput {
  branch_id: number
  discount?: number
  discount_reason?: string | null
  items: SaleItemInput[]
}

export interface SaleItemPreviewRead {
  stock_id: number
  quantity: number
  unit_price: number
  promotion_id: number | null
}

export interface SalePreviewRead {
  branch_id: number
  subtotal: number
  discount: number
  promotion_discount: number
  discount_reason: string | null
  total: number
  items: SaleItemPreviewRead[]
}

export const saleApi = {
  list: () => apiClient.get<SaleListRead[]>('/sales'),
  getById: (id: number) => apiClient.get<SaleDetailRead>(`/sales/${id}`),
  create: (payload: SaleCreate) => apiClient.post<SaleDetailRead>('/sales', payload),
  preview: (payload: SalePreviewInput) => apiClient.post<SalePreviewRead>('/sales/preview', payload),
  cancel: (id: number) => apiClient.post<SaleDetailRead>(`/sales/${id}/cancel`),
}
