import { categoryApi } from '@/api/category'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: useCategories,
  useGetById: useCategory,
  useCreate: useCreateCategory,
  useUpdate: useUpdateCategory,
  useRemove: useDeleteCategory,
} = createCrudHooks('categories', categoryApi)
