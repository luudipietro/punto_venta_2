import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCurrency } from '@/lib/format'
import { resolveDisplayPrice, priceColorClass } from '@/lib/pricingDisplay'
import { cn } from '@/lib/utils'
import { useSaleCatalog, type SaleCatalogEntry } from '@/modules/sale/useSaleCatalog'
import { useCartStore } from '@/modules/sale/cartStore'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { usePricingDisplayStore } from '@/stores/pricingDisplayStore'
import { PricingDisplaySelector } from '@/components/PricingDisplaySelector'

interface ProductGroup {
  productId: number
  productName: string
  imageUrl: string | null
  unitPrice: number
  totalAvailable: number
  variants: SaleCatalogEntry[]
}

export function ProductPicker({ branchId }: { branchId: number | null }) {
  const [search, setSearch] = useState('')
  const [poppedProductId, setPoppedProductId] = useState<number | null>(null)
  const { entries, isLoading } = useSaleCatalog(branchId)
  const addLine = useCartStore((state) => state.addLine)
  const { data: paymentMethods } = usePaymentMethods()
  const selectedPaymentMethodId = usePricingDisplayStore((s) => s.selectedPaymentMethodId)

  const groups = useMemo<ProductGroup[]>(() => {
    const byProduct = new Map<number, ProductGroup>()
    for (const entry of entries) {
      const existing = byProduct.get(entry.productId)
      if (existing) {
        existing.variants.push(entry)
        existing.totalAvailable += entry.availableQuantity
      } else {
        byProduct.set(entry.productId, {
          productId: entry.productId,
          productName: entry.productName,
          imageUrl: entry.imageUrl,
          unitPrice: entry.unitPrice,
          totalAvailable: entry.availableQuantity,
          variants: [entry],
        })
      }
    }
    return Array.from(byProduct.values())
  }, [entries])

  const filtered = groups.filter((group) =>
    group.productName.toLowerCase().includes(search.toLowerCase()),
  )

  function addVariant(entry: SaleCatalogEntry) {
    addLine({
      stockId: entry.stockId,
      productId: entry.productId,
      productName: entry.productName,
      variantLabel: entry.variantLabel,
      colorName: entry.colorName,
      sizeLabel: entry.sizeLabel,
      imageUrl: entry.imageUrl,
      unitPrice: entry.unitPrice,
      availableQuantity: entry.availableQuantity,
    })
    // Quick "press" feedback on the card itself, in addition to CartPanel's
    // own flash on the destination line — ties the animation to the actual
    // add rather than the click location, so it fires the same way whether
    // the card was clicked directly or a variant was chosen from its dropdown.
    setPoppedProductId(entry.productId)
    window.setTimeout(
      () => setPoppedProductId((current) => (current === entry.productId ? null : current)),
      200,
    )
  }

  if (branchId === null) {
    return <p className="text-sm text-muted-foreground">Elegí una sucursal para ver el stock disponible.</p>
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Input
          placeholder="Buscar producto..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="flex-1"
        />
        <PricingDisplaySelector />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando productos...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay stock disponible en esta sucursal.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
          {filtered.map((group) => {
            const { price: displayPrice, method } = resolveDisplayPrice(
              group.unitPrice,
              selectedPaymentMethodId,
              paymentMethods,
            )
            const card = (
              <Card
                role="button"
                tabIndex={0}
                onClick={group.variants.length === 1 ? () => addVariant(group.variants[0]) : undefined}
                className={cn(
                  'cursor-pointer gap-2 p-3 transition-[transform,colors] duration-200 hover:border-primary',
                  group.productId === poppedProductId && 'scale-95 border-primary',
                )}
              >
                {group.imageUrl ? (
                  <img
                    src={group.imageUrl}
                    alt=""
                    className="aspect-square w-full rounded-md border object-cover"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                ) : (
                  <div className="aspect-square w-full rounded-md border bg-muted" />
                )}
                <p className="truncate text-sm font-medium leading-tight">{group.productName}</p>
                {group.variants.length > 1 ? (
                  <p className="text-xs text-muted-foreground">
                    {group.variants.length} variantes disponibles
                  </p>
                ) : (
                  group.variants[0].variantLabel && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {group.variants[0].colorHex && (
                        <span
                          className="size-2.5 shrink-0 rounded-full border"
                          style={{ backgroundColor: group.variants[0].colorHex }}
                        />
                      )}
                      {group.variants[0].variantLabel}
                    </p>
                  )
                )}
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${priceColorClass(method)}`}>
                    {formatCurrency(displayPrice)}
                  </span>
                  <Badge variant="secondary">{group.totalAvailable} disp.</Badge>
                </div>
              </Card>
            )

            if (group.variants.length === 1) {
              return <div key={group.productId}>{card}</div>
            }

            return (
              <DropdownMenu key={group.productId}>
                <DropdownMenuTrigger asChild>{card}</DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {group.variants.map((variant) => (
                    <DropdownMenuItem key={variant.stockId} onClick={() => addVariant(variant)}>
                      {variant.colorHex && (
                        <span
                          className="size-3 shrink-0 rounded-full border"
                          style={{ backgroundColor: variant.colorHex }}
                        />
                      )}
                      <span className="flex-1 truncate">{variant.variantLabel || 'Sin variante'}</span>
                      <span className="text-xs text-muted-foreground">
                        {variant.availableQuantity} disp.
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          })}
        </div>
      )}
    </div>
  )
}
