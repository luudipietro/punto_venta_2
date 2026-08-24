import { useQuery } from '@tanstack/react-query'
import { customerApi } from '@/api/customer'
import { createCrudHooks } from '@/hooks/createCrudHooks'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

export const {
  useList: useCustomers,
  useGetById: useCustomer,
  useCreate: useCreateCustomer,
  useUpdate: useUpdateCustomer,
  useRemove: useDeleteCustomer,
} = createCrudHooks('customers', customerApi)

/** Debounced search by dni/name substring, for the checkout picker — only
 * queries once the user has typed at least 2 characters. */
export function useSearchCustomers(q: string) {
  const debounced = useDebouncedValue(q, 300)
  return useQuery({
    queryKey: ['customers', 'search', debounced],
    queryFn: () => customerApi.search(debounced),
    enabled: debounced.trim().length >= 2,
  })
}
