import { useQuery } from '@tanstack/react-query'
import { storefrontApi } from '@/api/storefront'
import type { CartLine } from '@/stores/cartStore'

/** Calls the promotion-aware `/storefront/cart/preview` endpoint for the
 * cart's priced lines (price-hidden lines are never sent — their price must
 * never be implied by a computed total, same reasoning as the backend's own
 * defensive exclusion). Aggregates by `productId` first, since two cart
 * lines for the same product in different variants are one product for
 * pricing/promotion purposes. Returns `undefined` while loading/on error so
 * callers can fall back to a naive sum without blocking checkout. */
export function useCartPreview(lines: CartLine[]) {
  const items = Object.values(
    lines
      .filter((line) => line.price !== null)
      .reduce<Record<number, { product_id: number; quantity: number }>>((acc, line) => {
        const existing = acc[line.productId]
        acc[line.productId] = {
          product_id: line.productId,
          quantity: (existing?.quantity ?? 0) + line.quantity,
        }
        return acc
      }, {}),
  ).sort((a, b) => a.product_id - b.product_id)

  return useQuery({
    queryKey: ['storefront-cart-preview', items],
    queryFn: () => storefrontApi.previewCart(items),
    enabled: items.length > 0,
    staleTime: 10_000,
    retry: false,
  })
}
