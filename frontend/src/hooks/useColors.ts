import { colorApi } from '@/api/color'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: useColors,
  useGetById: useColor,
  useCreate: useCreateColor,
  useUpdate: useUpdateColor,
  useRemove: useDeleteColor,
} = createCrudHooks('colors', colorApi)
