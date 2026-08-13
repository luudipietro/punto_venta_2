import { apiClient } from '@/api/client'

export type DiscountType = 'percentage' | 'fixed_amount'

export interface PromotionItemInput {
  product_id?: number | null
  category_id?: number | null
  discount_type: DiscountType
  discount_value: number
  min_quantity?: number
  max_quantity?: number | null
}

export interface PromotionItemRead {
  id: number
  promotion_id: number
  product_id: number | null
  category_id: number | null
  discount_type: DiscountType
  discount_value: number
  min_quantity: number
  max_quantity: number | null
}

export interface PromotionCreate {
  name: string
  start_date: string
  end_date: string
  active?: boolean
  items: PromotionItemInput[]
}

export interface PromotionRead {
  id: number
  name: string
  start_date: string
  end_date: string
  active: boolean
}

export interface PromotionDetailRead extends PromotionRead {
  items: PromotionItemRead[]
}

export const promotionApi = {
  list: () => apiClient.get<PromotionRead[]>('/promotions'),
  getById: (id: number) => apiClient.get<PromotionDetailRead>(`/promotions/${id}`),
  create: (payload: PromotionCreate) => apiClient.post<PromotionDetailRead>('/promotions', payload),
  update: (id: number, payload: PromotionCreate) =>
    apiClient.put<PromotionDetailRead>(`/promotions/${id}`, payload),
  remove: (id: number) => apiClient.delete(`/promotions/${id}`),
}
