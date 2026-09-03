import { create } from 'zustand'

interface CartUiState {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

/** Ephemeral "is the cart sidebar open" state — deliberately a separate,
 * non-`persist`ed store from `cartStore.ts` (the actual cart line items),
 * since there's no reason to remember the sidebar was open across a reload.
 * Lets any page (e.g. `ProductPage`) open the sidebar without prop-drilling
 * through the router's `<Outlet/>`. */
export const useCartUiStore = create<CartUiState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}))
