import { useStockOptions } from '@/modules/shared/useStockOptions'

interface ExchangeItemLike {
  stock_id: number
  quantity: number
}

/** Resolves each returned/new item's stock_id to a readable "Nx Producto
 * (Variante)" label — unfiltered by branch on purpose, same reasoning as
 * SaleDetailPanel/PurchaseDetailPanel: these are historical records, so a
 * stock row's current branch shouldn't hide what was actually exchanged. */
export function ExchangeItemsList({ items }: { items: ExchangeItemLike[] }) {
  const { options } = useStockOptions()

  if (items.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  return (
    <span>
      {items
        .map((item) => {
          const option = options.find((entry) => entry.stockId === item.stock_id)
          const label = option?.label ?? `Stock #${item.stock_id}`
          return item.quantity > 1 ? `${item.quantity}x ${label}` : label
        })
        .join(', ')}
    </span>
  )
}
