import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { usePricingDisplayStore } from '@/stores/pricingDisplayStore'

const BASE_PRICE_VALUE = 'base'

/** Payment-method picker that drives the display-only price preview shown
 * next to each product's price in the sale product picker and the products
 * catalog. Purely cosmetic — never feeds cart/checkout math. */
export function PricingDisplaySelector() {
  const { data: methods } = usePaymentMethods()
  const selectedId = usePricingDisplayStore((s) => s.selectedPaymentMethodId)
  const setSelectedId = usePricingDisplayStore((s) => s.setSelectedPaymentMethodId)

  return (
    <Select
      value={selectedId ? String(selectedId) : BASE_PRICE_VALUE}
      onValueChange={(value) => setSelectedId(value === BASE_PRICE_VALUE ? null : Number(value))}
    >
      <SelectTrigger className="w-44 sm:w-52">
        <SelectValue placeholder="Ver precio con..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={BASE_PRICE_VALUE}>Precio de lista</SelectItem>
        {methods?.map((pm) => (
          <SelectItem key={pm.id} value={String(pm.id)}>
            {pm.name}
            {pm.surcharge_percentage > 0 ? ` (+${pm.surcharge_percentage}%)` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
