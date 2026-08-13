import { SimpleCatalogPage } from '@/modules/catalog/SimpleCatalogPage'
import {
  useCreatePaymentMethod,
  useDeletePaymentMethod,
  usePaymentMethods,
  useUpdatePaymentMethod,
} from '@/hooks/usePaymentMethods'
import type { PaymentMethod, PaymentMethodInput } from '@/api/paymentMethod'

export function PaymentMethodsPage() {
  return (
    <SimpleCatalogPage<PaymentMethod, PaymentMethodInput>
      title="Métodos de pago"
      description="El recargo (%) se aplica automáticamente al elegir el método al cobrar"
      fields={[
        { name: 'name', label: 'Nombre' },
        { name: 'surcharge_percentage', label: 'Recargo (%)', type: 'number' },
        { name: 'is_cash', label: 'Es efectivo (caja física)', type: 'checkbox' },
      ]}
      emptyInput={{ name: '', surcharge_percentage: 0, is_cash: false }}
      useList={usePaymentMethods}
      useCreate={useCreatePaymentMethod}
      useUpdate={useUpdatePaymentMethod}
      useRemove={useDeletePaymentMethod}
    />
  )
}
