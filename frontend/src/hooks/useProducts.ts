import { productApi } from '@/api/product'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: useProducts,
  useGetById: useProduct,
  useCreate: useCreateProduct,
  useUpdate: useUpdateProduct,
  useRemove: useDeleteProduct,
} = createCrudHooks('products', productApi)
