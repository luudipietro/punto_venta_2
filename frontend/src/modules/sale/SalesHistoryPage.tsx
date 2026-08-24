import { Fragment, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
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
import { useBranches } from '@/hooks/useBranches'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useCreateExpense } from '@/hooks/useExpenses'
import { useDailyBalance } from '@/hooks/useDailyBalance'
import { useSales } from '@/hooks/useSales'
import { formatCurrency } from '@/lib/format'
import { SaleDetailPanel } from '@/modules/sale/SaleDetailPanel'
import type { ExpenseInput } from '@/api/expense'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function emptyExpense(branchId: number): ExpenseInput {
  return { branch_id: branchId, payment_method_id: 0, amount: 0, description: '', date: today() }
}

export function SalesHistoryPage() {
  const { data: branches } = useBranches()
  const { data: paymentMethods } = usePaymentMethods()
  const queryClient = useQueryClient()

  const [branchId, setBranchId] = useState<number | null>(null)
  useEffect(() => {
    if (branchId === null && branches && branches.length > 0) {
      setBranchId(branches[0].id)
    }
  }, [branches, branchId])

  const { data: balances, isLoading } = useDailyBalance(branchId ?? undefined)
  const { data: sales } = useSales()
  const createExpenseMutation = useCreateExpense()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ExpenseInput>(emptyExpense(0))
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null)

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
            <Select
              value={branchId ? String(branchId) : undefined}
              onValueChange={(value) => setBranchId(Number(value))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Sucursal" />
              </SelectTrigger>
              <SelectContent>
                {branches?.map((branch) => (
                  <SelectItem key={branch.id} value={String(branch.id)}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
              <TableHead>Balance de caja</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balances?.length ? (
              balances.map((day) => {
                const isExpanded = expandedDate === day.date
                const daySales = sales
                  ?.filter(
                    (sale) => sale.branch_id === branchId && sale.created_at.slice(0, 10) === day.date,
                  )
                  .sort((a, b) => b.id - a.id)
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
                      <TableCell>{day.date}</TableCell>
                      <TableCell>{formatCurrency(day.sales_cash_total)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatCurrency(day.sales_total)}
                      </TableCell>
                      <TableCell>{formatCurrency(day.expenses_cash_total)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(day.balance)}</TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${day.date}-detail`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <div className="p-3">
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
                                      Venta #{sale.id}
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
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
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
    </div>
  )
}
