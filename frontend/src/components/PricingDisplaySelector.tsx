import { useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { usePricingDisplayStore } from '@/stores/pricingDisplayStore'

/** Payment-method picker that drives the display-only price preview shown
 * next to each product's price in the sale product picker and the products
 * catalog. Purely cosmetic — never feeds cart/checkout math.
 *
 * The dropdown only ever lists real `PaymentMethod` rows — no invented
 * "Precio de lista" entry, not even as placeholder text (that read as a
 * payment method the shop never actually configured, which it isn't).
 * Defaults to the **first configured method** (e.g. "Efectivo") the first
 * time the catalog loads and nothing is picked yet — a real, no-recargo
 * method typically ends up first anyway, but either way the dropdown always
 * shows something that's genuinely in Métodos de pago. Once the cashier
 * picks one, that choice persists (`pricingDisplayStore`, `persist`d) same
 * as before. */
export function PricingDisplaySelector() {
  const { data: methods } = usePaymentMethods()
  const selectedId = usePricingDisplayStore((s) => s.selectedPaymentMethodId)
  const setSelectedId = usePricingDisplayStore((s) => s.setSelectedPaymentMethodId)

  const effectiveId = selectedId ?? methods?.[0]?.id ?? null

  useEffect(() => {
    if (selectedId === null && methods && methods.length > 0) {
      setSelectedId(methods[0].id)
    }
  }, [selectedId, methods, setSelectedId])

  if (!methods || methods.length === 0) return null

  return (
    <Select
      value={effectiveId ? String(effectiveId) : undefined}
      onValueChange={(value) => setSelectedId(Number(value))}
    >
      <SelectTrigger className="w-44 sm:w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {methods.map((pm) => (
          <SelectItem key={pm.id} value={String(pm.id)}>
            {pm.name}
            {pm.surcharge_percentage > 0 ? ` (+${pm.surcharge_percentage}%)` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
