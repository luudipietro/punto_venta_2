import { createCrudApi } from '@/api/base'

export interface Brand {
  id: number
  name: string
  description: string | null
}

export interface BrandInput {
  name: string
  description?: string | null
}

export const brandApi = createCrudApi<Brand, BrandInput>('brands')
