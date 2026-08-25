import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useCustomer } from '@/hooks/useCustomers'
import { useExchange, useExchanges } from '@/hooks/useExchanges'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { formatCurrency } from '@/lib/format'
import { ExchangeDetailPanel } from '@/modules/exchanges/ExchangeDetailPanel'
import { ExchangeForm } from '@/modules/exchanges/ExchangeForm'
import { ExchangeItemsList } from '@/modules/exchanges/ExchangeItemsList'
import { useStockOptions } from '@/modules/shared/useStockOptions'

export function SaleDetailPanel({ saleId }: { saleId: number }) {
  const { data: sale, isLoading } = useSale(saleId)
  const { data: paymentMethods } = usePaymentMethods()
  // No branchId here on purpose: this resolves *historical* stock_ids for
  // display, and a stock row's branch can drift from what it was at the
  // time of sale — filtering by the sale's branch would silently drop the
  // lookup and fall back to "Stock #N" (see CLAUDE.md / plan notes).
  const { options: stockOptions } = useStockOptions()
  const cancelMutation = useCancelSale()
  const { data: allExchanges } = useExchanges()
  const saleExchanges = allExchanges?.filter((exchange) => exchange.sale_id === saleId) ?? []

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [showExchangeForm, setShowExchangeForm] = useState(false)
  const [selectedExchangeId, setSelectedExchangeId] = useState<number | null>(null)

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
          {sale.customer_id !== null && <SaleCustomerLabel customerId={sale.customer_id} />}
        </div>
        {isCancelled && <Badge variant="destructive">Cancelada</Badge>}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Productos</p>
        <div className="flex flex-col gap-1.5">
          {sale.items.map((item) => {
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

      {saleExchanges.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="mb-1.5 text-sm font-medium">Cambios de esta venta</p>
            <div className="flex flex-col gap-1.5">
              {saleExchanges
                .sort((a, b) => b.id - a.id)
                .map((exchange) => (
                  <SaleExchangeRow
                    key={exchange.id}
                    exchangeId={exchange.id}
                    onClick={() => setSelectedExchangeId(exchange.id)}
                  />
                ))}
            </div>
          </div>
        </>
      )}

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

      <Dialog
        open={selectedExchangeId !== null}
        onOpenChange={(isOpen) => !isOpen && setSelectedExchangeId(null)}
      >
        <DialogContent className="max-h-[85vh] sm:max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de cambio</DialogTitle>
          </DialogHeader>
          {selectedExchangeId !== null && <ExchangeDetailPanel exchangeId={selectedExchangeId} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SaleCustomerLabel({ customerId }: { customerId: number }) {
  const { data: customer } = useCustomer(customerId)
  if (!customer) return null
  return (
    <p className="text-xs text-muted-foreground">
      Cliente: {customer.name} ({customer.dni})
    </p>
  )
}

function SaleExchangeRow({ exchangeId, onClick }: { exchangeId: number; onClick: () => void }) {
  const { data: exchange } = useExchange(exchangeId)
  if (!exchange) return null

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border px-3 py-2 text-left text-sm hover:border-primary"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          Cambio #{exchange.id}
          {exchange.cancelled_at !== null && <Badge variant="destructive">Cancelado</Badge>}
        </span>
        <span className="text-xs text-muted-foreground">
          Dif.: {formatCurrency(exchange.balance)}
        </span>
      </div>
      {exchange.returned_items.length > 0 && (
        <p>
          Devuelve: <ExchangeItemsList items={exchange.returned_items} />
        </p>
      )}
      {exchange.new_items.length > 0 && (
        <p>
          Entrega: <ExchangeItemsList items={exchange.new_items} />
        </p>
      )}
    </button>
  )
}
