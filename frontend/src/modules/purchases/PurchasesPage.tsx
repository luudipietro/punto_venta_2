import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
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
import { useCreatePurchase, usePurchases } from '@/hooks/usePurchases'
import { useStockOptions } from '@/modules/shared/useStockOptions'
import { formatCurrency } from '@/lib/format'
import type { PurchaseItemInput } from '@/api/purchase'

interface DraftItem extends PurchaseItemInput {
  key: string
}

export function PurchasesPage() {
  const { data: purchases, isLoading } = usePurchases()
  const { data: branches } = useBranches()
  const createMutation = useCreatePurchase()

  const [open, setOpen] = useState(false)
  const [branchId, setBranchId] = useState<number | null>(null)
  const [supplierName, setSupplierName] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])

  const { options: stockOptions } = useStockOptions(branchId)

  function openCreateDialog() {
    setBranchId(null)
    setSupplierName('')
    setItems([])
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
  const canSubmit = branchId !== null && items.length > 0 && items.every((item) => item.stock_id > 0)

  async function handleSubmit() {
    if (branchId === null) return
    try {
      await createMutation.mutateAsync({
        branch_id: branchId,
        supplier_name: supplierName || undefined,
        items: items.map(({ stock_id, quantity, unit_cost }) => ({ stock_id, quantity, unit_cost })),
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
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nueva compra</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>Sucursal</Label>
                    <Select
                      value={branchId ? String(branchId) : undefined}
                      onValueChange={(value) => {
                        setBranchId(Number(value))
                        setItems([])
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Elegir" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches?.map((branch) => (
                          <SelectItem key={branch.id} value={String(branch.id)}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                </div>

                <div className="flex justify-end text-sm font-medium">Total: {formatCurrency(total)}</div>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases?.length ? (
              [...purchases]
                .sort((a, b) => b.id - a.id)
                .map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell>{purchase.id}</TableCell>
                    <TableCell>
                      {branches?.find((branch) => branch.id === purchase.branch_id)?.name ?? purchase.branch_id}
                    </TableCell>
                    <TableCell>{purchase.supplier_name ?? '-'}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(purchase.total)}</TableCell>
                  </TableRow>
                ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin compras registradas
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
