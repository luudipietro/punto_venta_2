import { createCrudApi } from '@/api/base'

export interface Product {
  id: number
  name: string
  category_id: number
  brand_id: number
  cost: number
  price: number
  description: string | null
  image_url: string | null
}

export interface ProductInput {
  name: string
  category_id: number
  brand_id: number
  cost: number
  price: number
  description?: string | null
  image_url?: string | null
}

export const productApi = createCrudApi<Product, ProductInput>('products')
