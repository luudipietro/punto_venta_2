import { useQuery } from '@tanstack/react-query'
import { storefrontApi } from '@/api/storefront'

export function useStorefrontProducts() {
  return useQuery({ queryKey: ['storefront-products'], queryFn: storefrontApi.listProducts })
}
