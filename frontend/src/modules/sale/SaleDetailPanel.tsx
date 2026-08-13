import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCancelSale, useSale } from '@/hooks/useSales'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { formatCurrency } from '@/lib/format'
import { ExchangeForm } from '@/modules/exchanges/ExchangeForm'
import { useStockOptions } from '@/modules/shared/useStockOptions'

export function SaleDetailPanel({ saleId }: { saleId: number }) {
  const { data: sale, isLoading } = useSale(saleId)
  const { data: paymentMethods } = usePaymentMethods()
  const { options: stockOptions } = useStockOptions(sale?.branch_id)
  const cancelMutation = useCancelSale()

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [showExchangeForm, setShowExchangeForm] = useState(false)

  if (isLoading || !sale) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>
  }

  const isCancelled = sale.cancelled_at !== null

  async function handleCancel() {
    try {
      await cancelMutation.mutateAsync(saleId)
      toast.success('Venta cancelada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    } finally {
      setConfirmCancel(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Venta #{sale.id}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(sale.created_at).toLocaleString('es-AR')}
          </p>
        </div>
        {isCancelled && <Badge variant="destructive">Cancelada</Badge>}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Productos</p>
        <div className="flex flex-col gap-1">
          {sale.items.map((item) => {
            const label = stockOptions.find((option) => option.stockId === item.stock_id)?.label
            return (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span>
                  {item.quantity} × {label ?? `Stock #${item.stock_id}`}
                  {item.promotion_id !== null && (
                    <Badge variant="secondary" className="ml-1.5">
                      promo
                    </Badge>
                  )}
                </span>
                <span>{formatCurrency(item.unit_price * item.quantity)}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Pagos</p>
        <div className="flex flex-col gap-1">
          {sale.payments.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between text-sm">
              <span>
                {paymentMethods?.find((pm) => pm.id === payment.payment_method_id)?.name ??
                  `Método #${payment.payment_method_id}`}
              </span>
              <span>{formatCurrency(payment.amount_with_surcharge)}</span>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(sale.subtotal)}</span>
        </div>
        {sale.promotion_discount > 0 && (
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
            <span>Promoción</span>
            <span>-{formatCurrency(sale.promotion_discount)}</span>
          </div>
        )}
        {sale.discount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Descuento{sale.discount_reason ? ` (${sale.discount_reason})` : ''}
            </span>
            <span>-{formatCurrency(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>{formatCurrency(sale.total)}</span>
        </div>
      </div>

      {!isCancelled && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowExchangeForm((prev) => !prev)}>
            {showExchangeForm ? 'Ocultar cambio/devolución' : 'Cambio / devolución'}
          </Button>
          <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
            Cancelar venta
          </Button>
        </div>
      )}

      {showExchangeForm && !isCancelled && (
        <>
          <Separator />
          <ExchangeForm sale={sale} onSuccess={() => setShowExchangeForm(false)} />
        </>
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar venta #{sale.id}</AlertDialogTitle>
            <AlertDialogDescription>
              El stock vendido se va a restaurar y esta venta va a dejar de contar en el balance de
              caja. No se puede deshacer — si fue un error de carga, tendrás que hacer la venta de
              nuevo desde cero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel}>Cancelar venta</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
