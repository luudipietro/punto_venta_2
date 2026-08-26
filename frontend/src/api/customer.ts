import { createCrudApi } from '@/api/base'
import { apiClient } from '@/api/client'

export interface Customer {
  id: number
  dni: string
  name: string
  email: string | null
  phone: string | null
}

export interface CustomerInput {
  dni: string
  name: string
  email?: string | null
  phone?: string | null
}

export const customerApi = {
  ...createCrudApi<Customer, CustomerInput>('customers'),
  search: (q: string) => apiClient.get<Customer[]>(`/customers?q=${encodeURIComponent(q)}`),
}
