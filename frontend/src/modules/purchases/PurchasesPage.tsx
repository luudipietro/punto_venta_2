import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
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
import { useAuthStore } from '@/stores/authStore'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useCreatePurchase, usePurchases } from '@/hooks/usePurchases'
import { useStockOptions } from '@/modules/shared/useStockOptions'
import { PurchaseDetailPanel } from '@/modules/purchases/PurchaseDetailPanel'
import { ProductQuickCreateDialog } from '@/modules/purchases/ProductQuickCreateDialog'
import { StockQuickCreateDialog } from '@/modules/purchases/StockQuickCreateDialog'
import { formatCurrency } from '@/lib/format'
import type { PurchaseItemInput } from '@/api/purchase'

interface DraftItem extends PurchaseItemInput {
  key: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function PurchasesPage() {
  const { data: purchases, isLoading } = usePurchases()
  const { data: branches } = useBranches()
  const { data: paymentMethods } = usePaymentMethods()
  const createMutation = useCreatePurchase()
  const branchId = useAuthStore((s) => s.activeBranchId)

  const [open, setOpen] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(null)
  const [isPaid, setIsPaid] = useState(false)
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null)
  const [paymentDate, setPaymentDate] = useState(today())
  const [productQuickCreateOpen, setProductQuickCreateOpen] = useState(false)
  const [stockQuickCreateOpen, setStockQuickCreateOpen] = useState(false)
  const [stockQuickCreatePresetProductId, setStockQuickCreatePresetProductId] = useState<
    number | undefined
  >()
  const [pendingItemKey, setPendingItemKey] = useState<string | null>(null)

  const { options: stockOptions } = useStockOptions(branchId)

  function openCreateDialog() {
    setSupplierName('')
    setItems([])
    setIsPaid(false)
    setPaymentMethodId(null)
    setPaymentDate(today())
    setOpen(true)
  }

  function addItem() {
    setItems((prev) => [...prev, { key: crypto.randomUUID(), stock_id: 0, quantity: 1, unit_cost: 0 }])
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key))
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0)
  const canSubmit =
    branchId !== null &&
    items.length > 0 &&
    items.every((item) => item.stock_id > 0) &&
    (!isPaid || paymentMethodId !== null)

  async function handleSubmit() {
    if (branchId === null) return
    try {
      await createMutation.mutateAsync({
        branch_id: branchId,
        supplier_name: supplierName || undefined,
        items: items.map(({ stock_id, quantity, unit_cost }) => ({ stock_id, quantity, unit_cost })),
        payment_method_id: isPaid ? paymentMethodId : undefined,
        payment_date: isPaid ? paymentDate : undefined,
      })
      toast.success('Compra registrada')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Compras"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>Nueva compra</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nueva compra</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>Sucursal</Label>
                    <p className="text-sm text-muted-foreground">
                      {branches?.find((branch) => branch.id === branchId)?.name ?? '-'}
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="supplier">Proveedor</Label>
                    <Input
                      id="supplier"
                      value={supplierName}
                      onChange={(event) => setSupplierName(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {items.map((item) => (
                    <div key={item.key} className="flex items-center gap-2">
                      <Select
                        value={item.stock_id ? String(item.stock_id) : undefined}
                        onValueChange={(value) => updateItem(item.key, { stock_id: Number(value) })}
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
                        placeholder="Cant."
                        className="w-20 shrink-0"
                        value={item.quantity || ''}
                        onChange={(event) =>
                          updateItem(item.key, { quantity: Number(event.target.value) || 0 })
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        placeholder="Costo u."
                        className="w-28 shrink-0"
                        value={item.unit_cost || ''}
                        onChange={(event) =>
                          updateItem(item.key, { unit_cost: Number(event.target.value) || 0 })
                        }
                      />
                      <Button variant="ghost" size="icon" onClick={() => removeItem(item.key)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit gap-1.5"
                      onClick={addItem}
                      disabled={branchId === null}
                    >
                      <Plus className="size-3.5" />
                      Agregar ítem
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={branchId === null}
                      onClick={() => {
                        const key = crypto.randomUUID()
                        setItems((prev) => [...prev, { key, stock_id: 0, quantity: 1, unit_cost: 0 }])
                        setPendingItemKey(key)
                        setProductQuickCreateOpen(true)
                      }}
                    >
                      + Crear producto nuevo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={branchId === null}
                      onClick={() => {
                        const key = crypto.randomUUID()
                        setItems((prev) => [...prev, { key, stock_id: 0, quantity: 1, unit_cost: 0 }])
                        setPendingItemKey(key)
                        setStockQuickCreatePresetProductId(undefined)
                        setStockQuickCreateOpen(true)
                      }}
                    >
                      + Crear variante nueva
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end text-sm font-medium">Total: {formatCurrency(total)}</div>

                <div className="grid gap-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isPaid}
                      onChange={(event) => setIsPaid(event.target.checked)}
                    />
                    ¿Ya se pagó?
                  </label>
                  {isPaid && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-1.5">
                        <Label>Forma de pago</Label>
                        <Select
                          value={paymentMethodId ? String(paymentMethodId) : undefined}
                          onValueChange={(value) => setPaymentMethodId(Number(value))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Elegir método" />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentMethods?.map((pm) => (
                              <SelectItem key={pm.id} value={String(pm.id)}>
                                {pm.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="purchase-payment-date">Fecha de pago</Label>
                        <Input
                          id="purchase-payment-date"
                          type="date"
                          value={paymentDate}
                          onChange={(event) => setPaymentDate(event.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSubmit} disabled={!canSubmit || createMutation.isPending}>
                  Registrar compra
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases?.length ? (
              [...purchases]
                .sort((a, b) => b.id - a.id)
                .map((purchase) => (
                  <TableRow
                    key={purchase.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedPurchaseId(purchase.id)}
                  >
                    <TableCell>{purchase.id}</TableCell>
                    <TableCell>
                      {branches?.find((branch) => branch.id === purchase.branch_id)?.name ?? purchase.branch_id}
                    </TableCell>
                    <TableCell>{purchase.supplier_name ?? '-'}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(purchase.total)}</TableCell>
                    <TableCell>
                      {purchase.cancelled_at !== null ? (
                        <Badge variant="destructive">Cancelada</Badge>
                      ) : purchase.is_paid ? (
                        <Badge>Pagada</Badge>
                      ) : (
                        <Badge variant="secondary">Pendiente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin compras registradas
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

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

      <ProductQuickCreateDialog
        open={productQuickCreateOpen}
        onOpenChange={setProductQuickCreateOpen}
        onCreated={(product) => {
          setStockQuickCreatePresetProductId(product.id)
          setProductQuickCreateOpen(false)
          setStockQuickCreateOpen(true)
        }}
      />
      <StockQuickCreateDialog
        open={stockQuickCreateOpen}
        onOpenChange={setStockQuickCreateOpen}
        branchId={branchId ?? 0}
        presetProductId={stockQuickCreatePresetProductId}
        onCreated={(stock) => {
          if (pendingItemKey) updateItem(pendingItemKey, { stock_id: stock.id })
          setStockQuickCreateOpen(false)
          setStockQuickCreatePresetProductId(undefined)
          setPendingItemKey(null)
        }}
      />
    </div>
  )
}
