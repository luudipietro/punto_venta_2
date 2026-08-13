import { branchApi } from '@/api/branch'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: useBranches,
  useGetById: useBranch,
  useCreate: useCreateBranch,
  useUpdate: useUpdateBranch,
  useRemove: useDeleteBranch,
} = createCrudHooks('branches', branchApi)
