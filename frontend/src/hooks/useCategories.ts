import { useMutation, useQueryClient } from '@tanstack/react-query'
import { categoryApi } from '@/api/category'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: useCategories,
  useGetById: useCategory,
  useCreate: useCreateCategory,
  useUpdate: useUpdateCategory,
  useRemove: useDeleteCategory,
} = createCrudHooks('categories', categoryApi)

export function useSetCategoryProducts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, productIds }: { id: number; productIds: number[] }) =>
      categoryApi.setProducts(id, productIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
