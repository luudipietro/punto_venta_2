import { createCrudApi } from '@/api/base'
import type { UserRole } from '@/stores/authStore'

export interface User {
  id: number
  username: string
  role: UserRole
  branch_id: number | null
}

export interface UserInput {
  username: string
  role: UserRole
  branch_id: number | null
  password?: string
}

export const userApi = createCrudApi<User, UserInput>('users')
