import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateExchange } from '@/hooks/useExchanges'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useCustomer } from '@/hooks/useCustomers'
import { useBrandSettings } from '@/hooks/useBrandSettings'
import { formatCurrency } from '@/lib/format'
import { downloadExchangeReceiptPdf, formatVariantForReceipt, type ExchangeReceiptInput } from '@/lib/receipt'
import { brandConfig } from '@/theme/brand.config'
import { useStockOptions } from '@/modules/shared/useStockOptions'
import type { SaleDetailRead } from '@/api/sale'
import type { ExchangeItemInput, ExchangePaymentInput } from '@/api/exchange'

interface ReturnDraft {
  stock_id: number
  maxQuantity: number
  quantity: number
  unit_price: number
}

interface NewItemDraft extends ExchangeItemInput {
  key: string
}

interface PaymentDraft extends ExchangePaymentInput {
  key: string
}

interface ExchangeFormProps {
  sale: SaleDetailRead
  onSuccess: () => void
}

/** The returns/new-items/payments part of creating an Exchange, scoped to
 * one already-known sale — shared by the standalone "Cambios y devoluciones"
 * page (which picks the sale first) and the sale detail panel in the sales
 * history (where the sale is already the one you're looking at). */
export function ExchangeForm({ sale, onSuccess }: ExchangeFormProps) {
  const { data: paymentMethods } = usePaymentMethods()
  const createMutation = useCreateExchange()
  const { options: stockOptions } = useStockOptions(sale.branch_id)
  // Unfiltered: resolves the already-sold stock_ids for display, regardless
  // of which branch that stock currently reports (see useStockOptions docs).
  const { options: allStockOptions } = useStockOptions()
  const { data: customer } = useCustomer(sale.customer_id ?? undefined)
  const { data: brand } = useBrandSettings()
  const companyName = brand?.company_name ?? brandConfig.companyName

  const [returns, setReturns] = useState<ReturnDraft[]>([])
  const [newItems, setNewItems] = useState<NewItemDraft[]>([])
  const [payments, setPayments] = useState<PaymentDraft[]>([])
  const [waiveRefund, setWaiveRefund] = useState(false)
  const [pendingReceipt, setPendingReceipt] = useState<ExchangeReceiptInput | null>(null)

  const returnedTotal = returns.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const newTotal = newItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const balance = newTotal - returnedTotal
  const canWaiveRefund = balance < 0

  function toggleReturnItem(stockId: number, unitPrice: number, maxQuantity: number, checked: boolean) {
    setReturns((prev) =>
      checked
        ? [...prev, { stock_id: stockId, maxQuantity, quantity: maxQuantity, unit_price: unitPrice }]
        : prev.filter((item) => item.stock_id !== stockId),
    )
  }

  function updateReturnQuantity(stockId: number, quantity: number) {
    setReturns((prev) =>
      prev.map((item) =>
        item.stock_id === stockId
          ? { ...item, quantity: Math.max(0, Math.min(quantity, item.maxQuantity)) }
          : item,
      ),
    )
  }

  function addNewItem() {
    setNewItems((prev) => [...prev, { key: crypto.randomUUID(), stock_id: 0, quantity: 1, unit_price: 0 }])
  }

  function updateNewItem(key: string, patch: Partial<NewItemDraft>) {
    setNewItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  function addPayment() {
    setPayments((prev) => [...prev, { key: crypto.randomUUID(), payment_method_id: 0, amount: 0 }])
  }

  function updatePayment(key: string, patch: Partial<PaymentDraft>) {
    setPayments((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const canSubmit = returns.length > 0 && returns.every((item) => item.quantity > 0)

  async function handleSubmit() {
    try {
      const exchange = await createMutation.mutateAsync({
        sale_id: sale.id,
        returned_items: returns.map(({ stock_id, quantity, unit_price }) => ({
          stock_id,
          quantity,
          unit_price,
        })),
        new_items: newItems.map(({ stock_id, quantity, unit_price }) => ({ stock_id, quantity, unit_price })),
        payments: payments.map(({ payment_method_id, amount }) => ({ payment_method_id, amount })),
        waive_refund: canWaiveRefund && waiveRefund,
      })
      toast.success('Cambio/devolución registrado')
      setPendingReceipt({
        companyName,
        exchangeId: exchange.id,
        saleId: sale.id,
        createdAt: new Date(),
        returnedItems: returns.map((item) => {
          const option = allStockOptions.find((entry) => entry.stockId === item.stock_id)
          return {
            name: option?.productName ?? `Stock #${item.stock_id}`,
            variant: formatVariantForReceipt(option?.colorName, option?.sizeLabel),
            quantity: item.quantity,
            unitPrice: item.unit_price,
          }
        }),
        newItems: newItems.map((item) => {
          const option = stockOptions.find((entry) => entry.stockId === item.stock_id)
          return {
            name: option?.productName ?? `Stock #${item.stock_id}`,
            variant: formatVariantForReceipt(option?.colorName, option?.sizeLabel),
            quantity: item.quantity,
            unitPrice: item.unit_price,
          }
        }),
        balance,
        customerName: customer?.name ?? null,
        payments: payments.map((payment) => ({
          methodName:
            paymentMethods?.find((method) => method.id === payment.payment_method_id)?.name ?? '',
          amount: payment.amount,
        })),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-1.5 text-sm font-medium">Ítems a devolver</p>
        <div className="flex flex-col gap-1.5">
          {sale.items.map((item) => {
            const draft = returns.find((r) => r.stock_id === item.stock_id)
            const option = allStockOptions.find((entry) => entry.stockId === item.stock_id)
            return (
              <div key={item.id} className="flex items-center gap-2 rounded-md border p-2">
                <input
                  type="checkbox"
                  checked={!!draft}
                  onChange={(event) =>
                    toggleReturnItem(item.stock_id, item.unit_price, item.quantity, event.target.checked)
                  }
                />
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
                <span className="min-w-0 flex-1 text-sm">
                  {option?.label ?? `Stock #${item.stock_id}`} · {item.unit_price} c/u · vendidos:{' '}
                  {item.quantity}
                </span>
                {draft && (
                  <Input
                    type="number"
                    min={1}
                    max={item.quantity}
                    className="w-20"
                    value={draft.quantity}
                    onChange={(event) => updateReturnQuantity(item.stock_id, Number(event.target.value) || 0)}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Ítems nuevos (opcional)</p>
        <div className="flex flex-col gap-2">
          {newItems.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <Select
                value={item.stock_id ? String(item.stock_id) : undefined}
                onValueChange={(value) => {
                  const selected = stockOptions.find((option) => option.stockId === Number(value))
                  updateNewItem(item.key, {
                    stock_id: Number(value),
                    unit_price: selected?.price ?? item.unit_price,
                  })
                }}
              >
                <SelectTrigger className="min-w-0 flex-1">
                  <SelectValue placeholder="Producto" />
                </SelectTrigger>
                <SelectContent>
                  {stockOptions.map((option) => (
                    <SelectItem key={option.stockId} value={String(option.stockId)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                className="w-20 shrink-0"
                placeholder="Cant."
                value={item.quantity || ''}
                onChange={(event) => updateNewItem(item.key, { quantity: Number(event.target.value) || 0 })}
              />
              <Input
                type="number"
                min={0}
                className="w-24 shrink-0"
                placeholder="Precio"
                value={item.unit_price || ''}
                onChange={(event) =>
                  updateNewItem(item.key, { unit_price: Number(event.target.value) || 0 })
                }
              />
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={addNewItem}>
            <Plus className="size-3.5" />
            Agregar ítem nuevo
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border p-2 text-sm">
        <span className="text-muted-foreground">
          {balance >= 0 ? 'El cliente debe pagar' : 'Diferencia a favor del cliente'}
        </span>
        <span className="font-medium">{formatCurrency(Math.abs(balance))}</span>
      </div>

      {canWaiveRefund && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={waiveRefund}
            onChange={(event) => setWaiveRefund(event.target.checked)}
          />
          No reembolsar la diferencia (queda a favor del negocio)
        </label>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium">Pagos (positivo = cliente paga más, negativo = reembolso)</p>
        {waiveRefund && canWaiveRefund && (
          <p className="mb-1.5 text-xs text-muted-foreground">
            No hace falta cargar un pago: la diferencia se registra como no reembolsada.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {payments.map((payment) => (
            <div key={payment.key} className="flex items-center gap-2">
              <Select
                value={payment.payment_method_id ? String(payment.payment_method_id) : undefined}
                onValueChange={(value) => updatePayment(payment.key, { payment_method_id: Number(value) })}
              >
                <SelectTrigger className="min-w-0 flex-1">
                  <SelectValue placeholder="Método" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods?.map((pm) => (
                    <SelectItem key={pm.id} value={String(pm.id)}>
                      {pm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                className="w-28 shrink-0"
                placeholder="Monto"
                value={payment.amount || ''}
                onChange={(event) => updatePayment(payment.key, { amount: Number(event.target.value) || 0 })}
              />
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={addPayment}>
            <Plus className="size-3.5" />
            Agregar pago
          </Button>
        </div>
      </div>

      <Button onClick={handleSubmit} disabled={!canSubmit || createMutation.isPending} className="w-fit">
        Registrar cambio/devolución
      </Button>

      <AlertDialog
        open={pendingReceipt !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPendingReceipt(null)
            onSuccess()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambio/devolución registrado</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Querés descargar el comprobante en PDF? Elegí el formato según tu impresora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, gracias</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (pendingReceipt) downloadExchangeReceiptPdf(pendingReceipt, 'a4')
                setPendingReceipt(null)
                onSuccess()
              }}
            >
              Hoja A4
            </Button>
            <AlertDialogAction
              onClick={() => {
                if (pendingReceipt) downloadExchangeReceiptPdf(pendingReceipt, 'thermal')
                setPendingReceipt(null)
                onSuccess()
              }}
            >
              Térmica 80mm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
