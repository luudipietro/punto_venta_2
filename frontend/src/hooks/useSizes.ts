import { sizeApi } from '@/api/size'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: useSizes,
  useGetById: useSize,
  useCreate: useCreateSize,
  useUpdate: useUpdateSize,
  useRemove: useDeleteSize,
} = createCrudHooks('sizes', sizeApi)
