import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useBranches } from '@/hooks/useBranches'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useCancelPurchase, usePayPurchase, usePurchase } from '@/hooks/usePurchases'
import { formatCurrency, formatDate } from '@/lib/format'
import { useStockOptions } from '@/modules/shared/useStockOptions'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function PurchaseDetailPanel({ purchaseId }: { purchaseId: number }) {
  const { data: purchase, isLoading } = usePurchase(purchaseId)
  const { data: branches } = useBranches()
  const { data: paymentMethods } = usePaymentMethods()
  const payMutation = usePayPurchase()
  const cancelMutation = useCancelPurchase()
  // Unfiltered on purpose — same reasoning as SaleDetailPanel: this shows a
  // historical record, not a picker, so the branch a stock currently sits
  // in shouldn't hide the name of what was actually bought.
  const { options: stockOptions } = useStockOptions()

  const [payMethodId, setPayMethodId] = useState<number | null>(null)
  const [payDate, setPayDate] = useState(today())

  if (isLoading || !purchase) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>
  }

  async function handlePay() {
    if (payMethodId === null) return
    try {
      await payMutation.mutateAsync({
        id: purchaseId,
        payload: { payment_method_id: payMethodId, payment_date: payDate },
      })
      toast.success('Compra marcada como pagada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  async function handleCancel() {
    try {
      await cancelMutation.mutateAsync(purchaseId)
      toast.success('Compra cancelada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
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

      <div className="rounded-md border p-3 text-sm">
        {purchase.cancelled_at !== null ? (
          <Badge variant="destructive">Cancelada</Badge>
        ) : purchase.is_paid ? (
          <div className="flex items-center gap-2">
            <Badge>Pagada</Badge>
            <span className="text-muted-foreground">
              el {purchase.payment_date && formatDate(purchase.payment_date)} con{' '}
              {paymentMethods?.find((pm) => pm.id === purchase.payment_method_id)?.name ?? '-'}
            </span>
          </div>
        ) : (
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Pendiente de pago</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={payMethodId ? String(payMethodId) : undefined}
                onValueChange={(value) => setPayMethodId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Forma de pago" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods?.map((pm) => (
                    <SelectItem key={pm.id} value={String(pm.id)}>
                      {pm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid gap-1.5">
                <Label htmlFor="pay-date" className="sr-only">
                  Fecha de pago
                </Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={payDate}
                  onChange={(event) => setPayDate(event.target.value)}
                />
              </div>
            </div>
            <Button
              size="sm"
              className="w-fit"
              disabled={payMethodId === null || payMutation.isPending}
              onClick={handlePay}
            >
              Marcar como pagada
            </Button>
          </div>
        )}
      </div>

      {purchase.cancelled_at === null && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-fit text-destructive">
              Cancelar compra
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar esta compra?</AlertDialogTitle>
              <AlertDialogDescription>
                Se revertirá el stock que sumó esta compra. Si alguna unidad ya se vendió, la
                cancelación va a fallar hasta que haya stock suficiente para revertirla.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancel}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

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
