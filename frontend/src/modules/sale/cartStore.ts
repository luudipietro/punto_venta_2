import { create } from 'zustand'

export interface CartLine {
  stockId: number
  productId: number
  productName: string
  /** e.g. "Negro / M", or "" when the product has no color/size variety. */
  variantLabel: string
  colorName: string | null
  sizeLabel: string | null
  imageUrl: string | null
  unitPrice: number
  quantity: number
  availableQuantity: number
}

interface CartState {
  branchId: number | null
  lines: CartLine[]
  discount: number
  discountReason: string
  /** Which line to flash in CartPanel.tsx, and a monotonic counter so the
   * flash re-triggers even when the same stockId is added again right
   * after the previous flash finished — see CartPanel.tsx's effect. */
  lastAddedStockId: number | null
  lastAddedToken: number
  setBranch: (branchId: number | null) => void
  addLine: (line: Omit<CartLine, 'quantity'>) => void
  setQuantity: (stockId: number, quantity: number) => void
  removeLine: (stockId: number) => void
  setDiscount: (discount: number) => void
  setDiscountReason: (reason: string) => void
  clear: () => void
}

export const useCartStore = create<CartState>((set) => ({
  branchId: null,
  lines: [],
  discount: 0,
  discountReason: '',
  lastAddedStockId: null,
  lastAddedToken: 0,

  setBranch: (branchId) => set({ branchId, lines: [] }),

  addLine: (line) =>
    set((state) => {
      const existing = state.lines.find((item) => item.stockId === line.stockId)
      if (existing) {
        const quantity = Math.min(existing.quantity + 1, existing.availableQuantity)
        return {
          lines: state.lines.map((item) =>
            item.stockId === line.stockId ? { ...item, quantity } : item,
          ),
          lastAddedStockId: line.stockId,
          lastAddedToken: state.lastAddedToken + 1,
        }
      }
      if (line.availableQuantity < 1) return state
      return {
        lines: [...state.lines, { ...line, quantity: 1 }],
        lastAddedStockId: line.stockId,
        lastAddedToken: state.lastAddedToken + 1,
      }
    }),

  setQuantity: (stockId, quantity) =>
    set((state) => ({
      lines: state.lines
        .map((item) =>
          item.stockId === stockId
            ? { ...item, quantity: Math.max(0, Math.min(quantity, item.availableQuantity)) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    })),

  removeLine: (stockId) =>
    set((state) => ({ lines: state.lines.filter((item) => item.stockId !== stockId) })),

  setDiscount: (discount) => set({ discount }),
  setDiscountReason: (discountReason) => set({ discountReason }),

  clear: () => set((state) => ({ lines: [], discount: 0, discountReason: '', branchId: state.branchId })),
}))
