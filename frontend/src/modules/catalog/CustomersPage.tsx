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
        { name: 'dni', label: 'DNI' },
        { name: 'name', label: 'Nombre' },
      ]}
      emptyInput={{ dni: '', name: '' }}
      useList={useCustomers}
      useCreate={useCreateCustomer}
      useUpdate={useUpdateCustomer}
      useRemove={useDeleteCustomer}
    />
  )
}
