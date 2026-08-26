import { SimpleCatalogPage } from '@/modules/catalog/SimpleCatalogPage'
import {
  useCreateCustomer,
  useCustomers,
  useDeleteCustomer,
  useUpdateCustomer,
} from '@/hooks/useCustomers'
import type { Customer, CustomerInput } from '@/api/customer'

export function CustomersPage() {
  return (
    <SimpleCatalogPage<Customer, CustomerInput>
      title="Clientes"
      fields={[
        { name: 'dni', label: 'DNI', disabledOnEdit: true },
        { name: 'name', label: 'Nombre' },
        { name: 'email', label: 'Correo', optional: true },
        { name: 'phone', label: 'Teléfono', optional: true },
      ]}
      emptyInput={{ dni: '', name: '', email: '', phone: '' }}
      useList={useCustomers}
      useCreate={useCreateCustomer}
      useUpdate={useUpdateCustomer}
      useRemove={useDeleteCustomer}
    />
  )
}
