import { createCrudApi } from '@/api/base'

export interface Branch {
  id: number
  name: string
}

export interface BranchInput {
  name: string
}

export const branchApi = createCrudApi<Branch, BranchInput>('branches')
