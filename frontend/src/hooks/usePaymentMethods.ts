import { paymentMethodApi } from '@/api/paymentMethod'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: usePaymentMethods,
  useGetById: usePaymentMethod,
  useCreate: useCreatePaymentMethod,
  useUpdate: useUpdatePaymentMethod,
  useRemove: useDeletePaymentMethod,
} = createCrudHooks('payment-methods', paymentMethodApi)
