import { Separator } from '@/components/ui/separator'
import { useBranches } from '@/hooks/useBranches'
import { usePurchase } from '@/hooks/usePurchases'
import { formatCurrency } from '@/lib/format'
import { useStockOptions } from '@/modules/shared/useStockOptions'

export function PurchaseDetailPanel({ purchaseId }: { purchaseId: number }) {
  const { data: purchase, isLoading } = usePurchase(purchaseId)
  const { data: branches } = useBranches()
  // Unfiltered on purpose — same reasoning as SaleDetailPanel: this shows a
  // historical record, not a picker, so the branch a stock currently sits
  // in shouldn't hide the name of what was actually bought.
  const { options: stockOptions } = useStockOptions()

  if (isLoading || !purchase) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm font-medium">Compra #{purchase.id}</p>
        <p className="text-xs text-muted-foreground">
          {branches?.find((branch) => branch.id === purchase.branch_id)?.name ?? '-'}
          {purchase.supplier_name ? ` · ${purchase.supplier_name}` : ''}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Productos</p>
        <div className="flex flex-col gap-1.5">
          {purchase.items.map((item) => {
            const option = stockOptions.find((entry) => entry.stockId === item.stock_id)
            return (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                {option?.imageUrl ? (
                  <img
                    src={option.imageUrl}
                    alt=""
                    className="size-8 shrink-0 rounded-md border object-cover"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  {item.quantity} × {option?.label ?? `Stock #${item.stock_id}`}
                  <span className="text-muted-foreground"> ({formatCurrency(item.unit_cost)} c/u)</span>
                </span>
                <span>{formatCurrency(item.unit_cost * item.quantity)}</span>
              </div>
            )
          })}
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(purchase.subtotal)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>{formatCurrency(purchase.total)}</span>
        </div>
      </div>
    </div>
  )
}
