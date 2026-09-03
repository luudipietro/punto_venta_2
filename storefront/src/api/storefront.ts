import { apiClient } from '@/api/client'

/** Mirrors `app/schemas/storefront_schema.py`'s `StorefrontVariantRead`/
 * `StorefrontProductRead` — snake_case, same convention as every API type in
 * this codebase. */
export interface StorefrontVariant {
  stock_id: number
  color_name: string | null
  color_hex: string | null
  size_label: string | null
  quantity: number
}

export interface StorefrontProduct {
  id: number
  name: string
  description: string | null
  /** A JSON string, not a number (see `lib/format.ts`'s `formatCurrency`) —
   * or `null` when the admin marked this product's price as hidden
   * (`Product.price_hidden_from_storefront`). */
  price: string | null
  image_url: string | null
  /** Extra gallery photos beyond the cover `image_url`, for the product
   * page's thumbnail strip. */
  gallery_urls: string[]
  category_name: string | null
  variants: StorefrontVariant[]
  in_stock: boolean
}

export interface AppliedPromotion {
  promotion_id: number
  name: string
  discount_amount: string
}

export interface CartPreview {
  subtotal: string
  promotion_discount: string
  total: string
  applied_promotions: AppliedPromotion[]
}

export const storefrontApi = {
  listProducts: () => apiClient.get<StorefrontProduct[]>('/storefront/products'),
  previewCart: (items: { product_id: number; quantity: number }[]) =>
    apiClient.post<CartPreview>('/storefront/cart/preview', { items }),
}
