import { createCrudApi } from '@/api/base'
import { apiClient } from '@/api/client'

export interface Category {
  id: number
  name: string
  description: string | null
}

export interface CategoryInput {
  name: string
  description?: string | null
}

export const categoryApi = {
  ...createCrudApi<Category, CategoryInput>('categories'),
  /** Makes exactly `productIds` the members of the category (see
   * `CategoryService.set_products`). */
  setProducts: (id: number, productIds: number[]) =>
    apiClient.put<void>(`/categories/${id}/products`, { product_ids: productIds }),
}
