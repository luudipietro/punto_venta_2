import { createCrudApi } from '@/api/base'
import { API_BASE_URL, apiClient } from '@/api/client'

export interface Product {
  id: number
  name: string
  category_id: number | null
  brand_id: number | null
  cost: number
  price: number
  description: string | null
  image_url: string | null
}

export interface ProductInput {
  name: string
  category_id?: number | null
  brand_id?: number | null
  cost: number
  price: number
  description?: string | null
  image_url?: string | null
}

export const productApi = createCrudApi<Product, ProductInput>('products')

/** Uploads a product photo (file picker or device camera) and returns the
 * absolute URL to store on the product's `image_url` field. The backend
 * returns a relative path (served as a static file), so it's prefixed with
 * the API's own origin here. */
export async function uploadProductImage(file: File): Promise<string> {
  const { url } = await apiClient.upload<{ url: string }>('/uploads/images', file)
  return `${API_BASE_URL}${url}`
}

/** A product's extra gallery images (beyond the cover `image_url`) — a
 * separate collection so a future e-commerce frontend can show more than
 * one photo per product. */
export interface ProductImage {
  id: number
  product_id: number
  url: string
}

export const productImageApi = {
  list: (productId: number) => apiClient.get<ProductImage[]>(`/products/${productId}/images`),
  add: (productId: number, url: string) =>
    apiClient.post<ProductImage>(`/products/${productId}/images`, { url }),
  remove: (productId: number, imageId: number) =>
    apiClient.delete(`/products/${productId}/images/${imageId}`),
}
