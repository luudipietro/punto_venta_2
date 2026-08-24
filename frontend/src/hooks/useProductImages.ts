import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productImageApi } from '@/api/product'

export function useProductImages(productId: number | null) {
  return useQuery({
    queryKey: ['products', productId, 'images'],
    queryFn: () => productImageApi.list(productId as number),
    enabled: productId !== null,
  })
}

export function useAddProductImage(productId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => productImageApi.add(productId as number, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'images'] })
    },
  })
}

export function useRemoveProductImage(productId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (imageId: number) => productImageApi.remove(productId as number, imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'images'] })
    },
  })
}
