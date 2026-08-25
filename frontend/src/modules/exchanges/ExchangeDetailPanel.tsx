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
import { Separator } from '@/components/ui/separator'
import { useBranches } from '@/hooks/useBranches'
import { useCancelExchange, useExchange } from '@/hooks/useExchanges'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { ExchangeItemsList } from '@/modules/exchanges/ExchangeItemsList'

export function ExchangeDetailPanel({ exchangeId }: { exchangeId: number }) {
  const { data: exchange, isLoading } = useExchange(exchangeId)
  const { data: branches } = useBranches()
  const { data: paymentMethods } = usePaymentMethods()
  const cancelMutation = useCancelExchange()

  if (isLoading || !exchange) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>
  }

  async function handleCancel() {
    try {
      await cancelMutation.mutateAsync(exchangeId)
      toast.success('Cambio cancelado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  const paidTotal = exchange.payments.reduce((sum, payment) => sum + payment.amount, 0)
  const waived = exchange.balance - paidTotal

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            Cambio #{exchange.id} (venta #{exchange.sale_id})
          </p>
          <p className="text-xs text-muted-foreground">
            {branches?.find((branch) => branch.id === exchange.branch_id)?.name ?? '-'} ·{' '}
            {formatDateTime(exchange.created_at)}
          </p>
        </div>
        {exchange.cancelled_at !== null && <Badge variant="destructive">Cancelado</Badge>}
      </div>

      {exchange.returned_items.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Devuelve</p>
          <ExchangeItemsList items={exchange.returned_items} />
        </div>
      )}

      {exchange.new_items.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Entrega</p>
          <ExchangeItemsList items={exchange.new_items} />
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium">Pagos</p>
        {exchange.payments.length > 0 ? (
          <div className="flex flex-col gap-1">
            {exchange.payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between text-sm">
                <span>
                  {paymentMethods?.find((pm) => pm.id === payment.payment_method_id)?.name ??
                    `Método #${payment.payment_method_id}`}
                </span>
                <span>{formatCurrency(payment.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin pagos.</p>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between text-base font-semibold">
          <span>{exchange.balance >= 0 ? 'Diferencia a cobrar' : 'Diferencia a favor del cliente'}</span>
          <span>{formatCurrency(Math.abs(exchange.balance))}</span>
        </div>
        {waived !== 0 && (
          <div className="flex justify-between text-amber-600 dark:text-amber-400">
            <span>No reembolsado</span>
            <span>{formatCurrency(Math.abs(waived))}</span>
          </div>
        )}
      </div>

      {exchange.cancelled_at === null && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-fit text-destructive">
              Cancelar cambio
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar este cambio?</AlertDialogTitle>
              <AlertDialogDescription>
                Se revertirá el stock que movió este cambio (lo devuelto vuelve a salir, lo
                entregado vuelve a entrar). Solo se puede cancelar si es el cambio más reciente de
                esta venta.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancel}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
