import { Fragment, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useCreateExpense, useDeleteExpense, useExpenses } from '@/hooks/useExpenses'
import { useExchange, useExchanges } from '@/hooks/useExchanges'
import { useDailyBalance } from '@/hooks/useDailyBalance'
import { usePurchases } from '@/hooks/usePurchases'
import { useSales } from '@/hooks/useSales'
import { formatCurrency, formatDate } from '@/lib/format'
import { useAuthStore } from '@/stores/authStore'

const artDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
})

/** Same UTC->ART day-bucketing as ReportService.daily_cash_balance's
 * _to_art_date, done client-side so this page's per-day breakdown groups
 * sales/exchanges into the same day the backend's report used. */
function toArtDateKey(isoDateTime: string): string {
  const utcSuffixed = isoDateTime.endsWith('Z') ? isoDateTime : `${isoDateTime}Z`
  return artDateKeyFormatter.format(new Date(utcSuffixed))
}
import { SaleDetailPanel } from '@/modules/sale/SaleDetailPanel'
import { PurchaseDetailPanel } from '@/modules/purchases/PurchaseDetailPanel'
import { ExchangeDetailPanel } from '@/modules/exchanges/ExchangeDetailPanel'
import { ExchangeItemsList } from '@/modules/exchanges/ExchangeItemsList'
import type { ExpenseInput } from '@/api/expense'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function emptyExpense(branchId: number): ExpenseInput {
  return { branch_id: branchId, payment_method_id: 0, amount: 0, description: '', date: today() }
}

export function SalesHistoryPage() {
  const { data: paymentMethods } = usePaymentMethods()
  const queryClient = useQueryClient()

  const branchId = useAuthStore((s) => s.activeBranchId)

  const { data: balances, isLoading } = useDailyBalance(branchId ?? undefined)
  const { data: sales } = useSales()
  const { data: expenses } = useExpenses()
  const { data: purchases } = usePurchases()
  const { data: exchanges } = useExchanges()
  const createExpenseMutation = useCreateExpense()
  const deleteExpenseMutation = useDeleteExpense()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ExpenseInput>(emptyExpense(0))
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null)
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(null)
  const [selectedExchangeId, setSelectedExchangeId] = useState<number | null>(null)
  const [expenseToDelete, setExpenseToDelete] = useState<number | null>(null)

  async function handleDeleteExpense() {
    if (expenseToDelete === null) return
    try {
      await deleteExpenseMutation.mutateAsync(expenseToDelete)
      await queryClient.invalidateQueries({ queryKey: ['daily-balance', branchId] })
      toast.success('Gasto eliminado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    } finally {
      setExpenseToDelete(null)
    }
  }

  function openCreateDialog() {
    if (branchId === null) return
    setForm(emptyExpense(branchId))
    setOpen(true)
  }

  async function handleSubmit() {
    try {
      await createExpenseMutation.mutateAsync(form)
      await queryClient.invalidateQueries({ queryKey: ['daily-balance', branchId] })
      toast.success('Gasto registrado')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Historial de ventas"
        description="Balance de caja diario (efectivo) por sucursal"
        action={
          <div className="flex gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateDialog} disabled={branchId === null}>
                  Agregar gasto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuevo gasto</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="expense-description">Descripción</Label>
                    <Input
                      id="expense-description"
                      placeholder="Ej: insumos de limpieza"
                      value={form.description}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label htmlFor="expense-amount">Monto</Label>
                      <Input
                        id="expense-amount"
                        type="number"
                        min={0}
                        value={form.amount || ''}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, amount: Number(event.target.value) || 0 }))
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="expense-date">Fecha</Label>
                      <Input
                        id="expense-date"
                        type="date"
                        value={form.date}
                        onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Pagado con</Label>
                    <Select
                      value={form.payment_method_id ? String(form.payment_method_id) : undefined}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, payment_method_id: Number(value) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Elegir método" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods?.map((pm) => (
                          <SelectItem key={pm.id} value={String(pm.id)}>
                            {pm.name}
                            {pm.is_cash ? ' (caja)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      createExpenseMutation.isPending ||
                      !form.description ||
                      !form.amount ||
                      !form.payment_method_id
                    }
                  >
                    Guardar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Fecha</TableHead>
              <TableHead>Ventas efectivo</TableHead>
              <TableHead>Ventas totales</TableHead>
              <TableHead>Gastos efectivo</TableHead>
              <TableHead>Compras efectivo</TableHead>
              <TableHead>Cambios efectivo</TableHead>
              <TableHead>Balance de caja</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balances?.length ? (
              balances.map((day) => {
                const isExpanded = expandedDate === day.date
                const daySales = sales
                  ?.filter(
                    (sale) => sale.branch_id === branchId && toArtDateKey(sale.created_at) === day.date,
                  )
                  .sort((a, b) => b.id - a.id)
                const dayExpenses = expenses?.filter(
                  (expense) => expense.branch_id === branchId && expense.date === day.date,
                )
                const dayPurchases = purchases
                  ?.filter(
                    (purchase) =>
                      purchase.branch_id === branchId &&
                      purchase.is_paid &&
                      purchase.payment_date === day.date,
                  )
                  .sort((a, b) => b.id - a.id)
                const dayExchanges = exchanges?.filter(
                  (exchange) =>
                    exchange.branch_id === branchId && toArtDateKey(exchange.created_at) === day.date,
                )
                return (
                  <Fragment key={day.date}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedDate(isExpanded ? null : day.date)}
                    >
                      <TableCell>
                        {isExpanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </TableCell>
                      <TableCell>{formatDate(day.date)}</TableCell>
                      <TableCell>{formatCurrency(day.sales_cash_total)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatCurrency(day.sales_total)}
                      </TableCell>
                      <TableCell>{formatCurrency(day.expenses_cash_total)}</TableCell>
                      <TableCell>{formatCurrency(day.purchases_cash_total)}</TableCell>
                      <TableCell>{formatCurrency(day.exchanges_cash_total)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(day.balance)}</TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${day.date}-detail`}>
                        <TableCell colSpan={8} className="bg-muted/30 p-0">
                          <div className="grid gap-3 p-3">
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">Ventas</p>
                              {daySales?.length ? (
                                <div className="flex flex-col gap-1">
                                  {daySales.map((sale) => (
                                    <button
                                      key={sale.id}
                                      type="button"
                                      onClick={() => setSelectedSaleId(sale.id)}
                                      className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-left text-sm hover:border-primary"
                                    >
                                      <span className="flex items-center gap-2">
                                        {sale.items_summary}
                                        <span className="text-xs text-muted-foreground">#{sale.id}</span>
                                        {sale.cancelled_at !== null && (
                                          <Badge variant="destructive">Cancelada</Badge>
                                        )}
                                      </span>
                                      <span>{formatCurrency(sale.total)}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">Sin ventas ese día.</p>
                              )}
                            </div>

                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">Gastos</p>
                              {dayExpenses?.length ? (
                                <div className="flex flex-col gap-1">
                                  {dayExpenses.map((expense) => (
                                    <div
                                      key={expense.id}
                                      className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                                    >
                                      <span>
                                        {expense.description}
                                        <span className="ml-2 text-xs text-muted-foreground">
                                          {paymentMethods?.find(
                                            (pm) => pm.id === expense.payment_method_id,
                                          )?.name ?? '-'}
                                        </span>
                                      </span>
                                      <span className="flex items-center gap-2">
                                        {formatCurrency(expense.amount)}
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="size-6"
                                          onClick={() => setExpenseToDelete(expense.id)}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">Sin gastos ese día.</p>
                              )}
                            </div>

                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                Compras pagadas
                              </p>
                              {dayPurchases?.length ? (
                                <div className="flex flex-col gap-1">
                                  {dayPurchases.map((purchase) => (
                                    <button
                                      key={purchase.id}
                                      type="button"
                                      onClick={() => setSelectedPurchaseId(purchase.id)}
                                      className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-left text-sm hover:border-primary"
                                    >
                                      <span>
                                        {purchase.supplier_name ?? 'Sin proveedor'}
                                        <span className="ml-2 text-xs text-muted-foreground">
                                          #{purchase.id}
                                        </span>
                                      </span>
                                      <span>{formatCurrency(purchase.total)}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">Sin compras pagadas ese día.</p>
                              )}
                            </div>

                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                Cambios y devoluciones
                              </p>
                              {dayExchanges?.length ? (
                                <div className="flex flex-col gap-1">
                                  {dayExchanges.map((exchange) => (
                                    <ExchangeCashRow
                                      key={exchange.id}
                                      exchangeId={exchange.id}
                                      onClick={() => setSelectedExchangeId(exchange.id)}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">Sin cambios ese día.</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Sin movimientos para esta sucursal
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={selectedSaleId !== null} onOpenChange={(isOpen) => !isOpen && setSelectedSaleId(null)}>
        <DialogContent className="max-h-[85vh] sm:max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de venta</DialogTitle>
          </DialogHeader>
          {selectedSaleId !== null && <SaleDetailPanel saleId={selectedSaleId} />}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedPurchaseId !== null}
        onOpenChange={(isOpen) => !isOpen && setSelectedPurchaseId(null)}
      >
        <DialogContent className="max-h-[85vh] sm:max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de compra</DialogTitle>
          </DialogHeader>
          {selectedPurchaseId !== null && <PurchaseDetailPanel purchaseId={selectedPurchaseId} />}
        </DialogContent>
      </Dialog>

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

      <AlertDialog
        open={expenseToDelete !== null}
        onOpenChange={(isOpen) => !isOpen && setExpenseToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se va a borrar por completo y va a dejar de contar en el balance de caja de ese día.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExpense}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Shows one exchange's cash impact (positive = customer paid more, negative
 * = refund) and its money difference — needs the detail endpoint since the
 * list one doesn't include payments/balance. Clickable to open the full
 * detail panel, same as sales/purchases rows. */
function ExchangeCashRow({
  exchangeId,
  onClick,
}: {
  exchangeId: number
  onClick: () => void
}) {
  const { data: exchange } = useExchange(exchangeId)
  const { data: paymentMethods } = usePaymentMethods()

  if (!exchange) return null

  // `Number(...)`: the API serializes Decimal fields as JSON strings (to
  // avoid float precision loss), so `payment.amount` is actually a string
  // at runtime despite its `number` type — summing with bare `+` silently
  // string-concatenates instead of adding, producing "$ NaN" once
  // formatted. Real bug found via manual QA (any exchange with >=1 payment
  // showed NaN here).
  const cashTotal = exchange.payments
    .filter((payment) =>
      paymentMethods?.some((pm) => pm.id === payment.payment_method_id && pm.is_cash),
    )
    .reduce((sum, payment) => sum + Number(payment.amount), 0)

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border bg-background px-3 py-2 text-left text-sm hover:border-primary"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          Cambio #{exchange.id} (venta #{exchange.sale_id})
          {exchange.cancelled_at !== null && <Badge variant="destructive">Cancelado</Badge>}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Dif.: {formatCurrency(exchange.balance)}
          </span>
          <span>{formatCurrency(cashTotal)}</span>
        </span>
      </div>
      <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
        {exchange.returned_items.length > 0 && (
          <span>Devuelve: <ExchangeItemsList items={exchange.returned_items} /></span>
        )}
        {exchange.new_items.length > 0 && (
          <span>Entrega: <ExchangeItemsList items={exchange.new_items} /></span>
        )}
      </div>
    </button>
  )
}
