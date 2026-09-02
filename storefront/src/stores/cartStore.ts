import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartLine {
  /** Unique per product+variant (`${productId}:${stockId ?? 'none'}`) — lets
   * the same product with two different variants be two separate lines. */
  key: string
  productId: number
  productName: string
  imageUrl: string | null
  /** A JSON string, or `null` when the product's price is hidden — see
   * `lib/format.ts`'s `formatPriceOrConsult`. */
  price: string | null
  variantLabel: string | null
  quantity: number
}

interface CartState {
  lines: CartLine[]
  addLine: (line: Omit<CartLine, 'quantity'>, quantity: number) => void
  setQuantity: (key: string, quantity: number) => void
  removeLine: (key: string) => void
  clear: () => void
}

/** Persisted to localStorage (own key, separate from anything else) so a
 * customer who closes the tab mid-browsing doesn't lose their cart — same
 * `persist` middleware pattern as the admin app's own `cartStore.ts`/
 * `pricingDisplayStore.ts`, just for a different, unrelated cart. */
export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      addLine: (line, quantity) =>
        set((state) => {
          const existing = state.lines.find((l) => l.key === line.key)
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.key === line.key ? { ...l, quantity: l.quantity + quantity } : l,
              ),
            }
          }
          return { lines: [...state.lines, { ...line, quantity }] }
        }),
      setQuantity: (key, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.key !== key)
              : state.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
        })),
      removeLine: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'storefront-cart' },
  ),
)
