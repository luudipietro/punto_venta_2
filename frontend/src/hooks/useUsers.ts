import { userApi } from '@/api/user'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: useUsers,
  useGetById: useUser,
  useCreate: useCreateUser,
  useUpdate: useUpdateUser,
  useRemove: useDeleteUser,
} = createCrudHooks('users', userApi)
