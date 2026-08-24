import { apiClient } from '@/api/client'

export interface PurchaseItemInput {
  stock_id: number
  quantity: number
  unit_cost: number
}

export interface PurchaseCreate {
  branch_id: number
  supplier_name?: string | null
  items: PurchaseItemInput[]
  payment_method_id?: number | null
  payment_date?: string | null
}

export interface PurchasePayInput {
  payment_method_id: number
  payment_date?: string | null
}

export interface PurchaseItemRead {
  id: number
  purchase_id: number
  stock_id: number
  quantity: number
  unit_cost: number
}

export interface PurchaseRead {
  id: number
  branch_id: number
  supplier_name: string | null
  subtotal: number
  total: number
  payment_method_id: number | null
  payment_date: string | null
  is_paid: boolean
  cancelled_at: string | null
}

export interface PurchaseDetailRead extends PurchaseRead {
  items: PurchaseItemRead[]
}

export const purchaseApi = {
  list: () => apiClient.get<PurchaseRead[]>('/purchases'),
  getById: (id: number) => apiClient.get<PurchaseDetailRead>(`/purchases/${id}`),
  create: (payload: PurchaseCreate) => apiClient.post<PurchaseDetailRead>('/purchases', payload),
  pay: (id: number, payload: PurchasePayInput) =>
    apiClient.post<PurchaseRead>(`/purchases/${id}/pay`, payload),
  cancel: (id: number) => apiClient.post<PurchaseRead>(`/purchases/${id}/cancel`),
}
