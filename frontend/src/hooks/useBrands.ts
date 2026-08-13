import { brandApi } from '@/api/brand'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: useBrands,
  useGetById: useBrand,
  useCreate: useCreateBrand,
  useUpdate: useUpdateBrand,
  useRemove: useDeleteBrand,
} = createCrudHooks('brands', brandApi)
