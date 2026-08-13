import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/format'
import { useSaleCatalog } from '@/modules/sale/useSaleCatalog'
import { useCartStore } from '@/modules/sale/cartStore'

export function ProductPicker({ branchId }: { branchId: number | null }) {
  const [search, setSearch] = useState('')
  const { entries, isLoading } = useSaleCatalog(branchId)
  const addLine = useCartStore((state) => state.addLine)

  const filtered = entries.filter((entry) =>
    `${entry.productName} ${entry.variantLabel}`.toLowerCase().includes(search.toLowerCase()),
  )

  if (branchId === null) {
    return <p className="text-sm text-muted-foreground">Elegí una sucursal para ver el stock disponible.</p>
  }

  return (
    <div>
      <Input
        placeholder="Buscar producto..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="mb-3"
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando productos...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay stock disponible en esta sucursal.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <Card
              key={entry.stockId}
              role="button"
              tabIndex={0}
              onClick={() =>
                addLine({
                  stockId: entry.stockId,
                  productId: entry.productId,
                  productName: entry.productName,
                  variantLabel: entry.variantLabel,
                  imageUrl: entry.imageUrl,
                  unitPrice: entry.unitPrice,
                  availableQuantity: entry.availableQuantity,
                })
              }
              className="cursor-pointer gap-1 p-3 transition-colors hover:border-primary"
            >
              <div className="flex items-center gap-2">
                {entry.imageUrl ? (
                  <img
                    src={entry.imageUrl}
                    alt=""
                    className="size-8 shrink-0 rounded-md border object-cover"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                ) : null}
                <p className="text-sm font-medium leading-tight">{entry.productName}</p>
              </div>
              {entry.variantLabel && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {entry.colorHex && (
                    <span
                      className="size-3 shrink-0 rounded-full border"
                      style={{ backgroundColor: entry.colorHex }}
                    />
                  )}
                  {entry.variantLabel}
                </p>
              )}
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm font-semibold">{formatCurrency(entry.unitPrice)}</span>
                <Badge variant="secondary">{entry.availableQuantity} disp.</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
