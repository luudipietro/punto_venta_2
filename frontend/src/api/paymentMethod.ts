import { createCrudApi } from '@/api/base'

export interface PaymentMethod {
  id: number
  name: string
  surcharge_percentage: number
  is_cash: boolean
}

export interface PaymentMethodInput {
  name: string
  surcharge_percentage?: number
  is_cash?: boolean
}

export const paymentMethodApi = createCrudApi<PaymentMethod, PaymentMethodInput>('payment-methods')
