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
}

export interface PurchaseDetailRead extends PurchaseRead {
  items: PurchaseItemRead[]
}

export const purchaseApi = {
  list: () => apiClient.get<PurchaseRead[]>('/purchases'),
  getById: (id: number) => apiClient.get<PurchaseDetailRead>(`/purchases/${id}`),
  create: (payload: PurchaseCreate) => apiClient.post<PurchaseDetailRead>('/purchases', payload),
}
