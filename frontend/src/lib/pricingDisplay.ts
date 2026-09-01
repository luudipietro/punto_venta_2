import { applySurcharge } from '@/lib/payment'
import type { PaymentMethod } from '@/api/paymentMethod'

/**
 * Resolves the currently selected payment method (if any, and if it still
 * exists) and computes the display price for a given base price. Returns the
 * base price unchanged, and `method: null`, when nothing is selected or the
 * previously-selected method was deleted (dangling persisted id) — this
 * mirrors current/legacy behavior exactly, so there is no error state to
 * handle in the UI, it just silently falls back to list price.
 */
export function resolveDisplayPrice(
  basePrice: number,
  selectedPaymentMethodId: number | null,
  methods: PaymentMethod[] | undefined,
): { price: number; method: PaymentMethod | null } {
  const method = methods?.find((m) => m.id === selectedPaymentMethodId) ?? null
  if (!method) return { price: basePrice, method: null }
  return { price: applySurcharge(basePrice, method.surcharge_percentage), method }
}

/** Tailwind color classes for a displayed price, matching the amber/emerald
 * "differs from base value" vs "ok/base value" convention already used in
 * PaymentPanel.tsx — amber once a surcharge is actually applied. */
export function priceColorClass(method: PaymentMethod | null): string {
  return method && method.surcharge_percentage > 0
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-emerald-600 dark:text-emerald-400'
}
