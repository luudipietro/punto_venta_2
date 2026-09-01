import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Payment method chosen to preview product prices with (sale picker + catalog).
 * Display-only — never read by cartStore or any checkout/sale calculation. */
interface PricingDisplayState {
  selectedPaymentMethodId: number | null
  setSelectedPaymentMethodId: (id: number | null) => void
}

export const usePricingDisplayStore = create<PricingDisplayState>()(
  persist(
    (set) => ({
      selectedPaymentMethodId: null,
      setSelectedPaymentMethodId: (id) => set({ selectedPaymentMethodId: id }),
    }),
    { name: 'pos-pricing-display' },
  ),
)
