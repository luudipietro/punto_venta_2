import { createCrudApi } from '@/api/base'

export interface Category {
  id: number
  name: string
  description: string | null
}

export interface CategoryInput {
  name: string
  description?: string | null
}

export const categoryApi = createCrudApi<Category, CategoryInput>('categories')
