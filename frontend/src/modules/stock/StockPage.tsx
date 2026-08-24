import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useProducts } from '@/hooks/useProducts'
import { useBranches } from '@/hooks/useBranches'
import { useColors } from '@/hooks/useColors'
import { useSizes } from '@/hooks/useSizes'
import { useCreateStock, useDecreaseStock, useDeleteStock, useIncreaseStock, useStocks } from '@/hooks/useStocks'
import type { StockInput } from '@/api/stock'

const emptyInput: StockInput = {
  product_id: 0,
  branch_id: 0,
  color_id: null,
  size_id: null,
  quantity: 0,
}

export function StockPage() {
  const { data: stocks, isLoading } = useStocks()
  const { data: products } = useProducts()
  const { data: branches } = useBranches()
  const { data: colors } = useColors()
  const { data: sizes } = useSizes()

  const createMutation = useCreateStock()
  const removeMutation = useDeleteStock()
  const increaseMutation = useIncreaseStock()
  const decreaseMutation = useDecreaseStock()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<StockInput>(emptyInput)
  const [pendingAdjustment, setPendingAdjustment] = useState<{
    stockId: number
    delta: 1 | -1
    productName: string
  } | null>(null)

  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState<number | 'all'>('all')
  const [sortField, setSortField] = useState<'name' | 'quantity' | 'branch'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(field: 'name' | 'quantity' | 'branch') {
    if (field === sortField) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const rows = useMemo(() => {
    if (!stocks) return []
    return stocks.map((stock) => {
      const product = products?.find((p) => p.id === stock.product_id)
      const color = stock.color_id !== null ? colors?.find((c) => c.id === stock.color_id) : undefined
      const variant = [
        color?.name,
        stock.size_id !== null ? sizes?.find((s) => s.id === stock.size_id)?.label : null,
      ]
        .filter(Boolean)
        .join(' / ')
      const branch = branches?.find((b) => b.id === stock.branch_id)
      return {
        stock,
        product,
        productName: product?.name ?? 'este producto',
        color,
        variant,
        branchName: branch?.name ?? '',
      }
    })
  }, [stocks, products, colors, sizes, branches])

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (branchFilter !== 'all' && row.stock.branch_id !== branchFilter) return false
      if (search && !row.productName.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0
      if (sortField === 'name') comparison = a.productName.localeCompare(b.productName)
      else if (sortField === 'quantity') comparison = a.stock.quantity - b.stock.quantity
      else comparison = a.branchName.localeCompare(b.branchName)
      return sortDir === 'asc' ? comparison : -comparison
    })
    return sorted
  }, [rows, search, branchFilter, sortField, sortDir])

  function openCreateDialog() {
    setForm(emptyInput)
    setOpen(true)
  }

  async function handleSubmit() {
    try {
      await createMutation.mutateAsync(form)
      toast.success('Stock creado')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta fila de stock?')) return
    try {
      await removeMutation.mutateAsync(id)
      toast.success('Stock eliminado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  async function confirmPendingAdjustment() {
    if (!pendingAdjustment) return
    const { stockId, delta } = pendingAdjustment
    try {
      if (delta === 1) await increaseMutation.mutateAsync({ id: stockId, amount: 1 })
      else await decreaseMutation.mutateAsync({ id: stockId, amount: 1 })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    } finally {
      setPendingAdjustment(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>Nuevo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva fila de stock</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label>Producto</Label>
                  <Select
                    value={form.product_id ? String(form.product_id) : undefined}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, product_id: Number(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir" />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.map((product) => (
                        <SelectItem key={product.id} value={String(product.id)}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Sucursal</Label>
                  <Select
                    value={form.branch_id ? String(form.branch_id) : undefined}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, branch_id: Number(value) }))}
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>Color (opcional)</Label>
                    <Select
                      value={form.color_id ? String(form.color_id) : undefined}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, color_id: value ? Number(value) : null }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin color" />
                      </SelectTrigger>
                      <SelectContent>
                        {colors?.map((color) => (
                          <SelectItem key={color.id} value={String(color.id)}>
                            {color.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Talle (opcional)</Label>
                    <Select
                      value={form.size_id ? String(form.size_id) : undefined}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, size_id: value ? Number(value) : null }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin talle" />
                      </SelectTrigger>
                      <SelectContent>
                        {sizes?.map((size) => (
                          <SelectItem key={size.id} value={String(size.id)}>
                            {size.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="quantity">Cantidad inicial</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min={0}
                    value={form.quantity || ''}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, quantity: Number(event.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || !form.product_id || !form.branch_id}
                >
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por producto..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-64"
        />
        <Select
          value={String(branchFilter)}
          onValueChange={(value) => setBranchFilter(value === 'all' ? 'all' : Number(value))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sucursal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sucursales</SelectItem>
            {branches?.map((branch) => (
              <SelectItem key={branch.id} value={String(branch.id)}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <SortableHead
                label="Producto"
                active={sortField === 'name'}
                dir={sortDir}
                onClick={() => toggleSort('name')}
              />
              <TableHead>Variante</TableHead>
              <SortableHead
                label="Sucursal"
                active={sortField === 'branch'}
                dir={sortDir}
                onClick={() => toggleSort('branch')}
              />
              <SortableHead
                label="Cantidad"
                active={sortField === 'quantity'}
                dir={sortDir}
                onClick={() => toggleSort('quantity')}
              />
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length ? (
              visibleRows.map(({ stock, product, productName, color, variant, branchName }) => (
                <TableRow key={stock.id}>
                  <TableCell>
                    {product?.image_url ? (
                      <img
                        src={product.image_url}
                        alt=""
                        className="size-9 rounded-md border object-cover"
                        onError={(event) => {
                          event.currentTarget.style.visibility = 'hidden'
                        }}
                      />
                    ) : (
                      <div className="size-9 rounded-md border bg-muted" />
                    )}
                  </TableCell>
                  <TableCell>{productName}</TableCell>
                  <TableCell>
                    {variant ? (
                      <span className="inline-flex items-center gap-1.5">
                        {color && (
                          <span
                            className="inline-block size-3 shrink-0 rounded-full border"
                            style={{ backgroundColor: color.hex_code }}
                          />
                        )}
                        {variant}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>{branchName || '-'}</TableCell>
                  <TableCell>{stock.quantity}</TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setPendingAdjustment({ stockId: stock.id, delta: -1, productName })
                      }
                      disabled={stock.quantity <= 0}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setPendingAdjustment({ stockId: stock.id, delta: 1, productName })
                      }
                    >
                      <Plus className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(stock.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sin stock cargado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <AlertDialog
        open={pendingAdjustment !== null}
        onOpenChange={(isOpen) => !isOpen && setPendingAdjustment(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAdjustment?.delta === 1 ? 'Sumar' : 'Restar'} 1 unidad
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAdjustment?.delta === 1
                ? `Se va a sumar 1 unidad de stock a "${pendingAdjustment?.productName}".`
                : `Se va a restar 1 unidad de stock a "${pendingAdjustment?.productName}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingAdjustment}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex items-center gap-1 text-xs font-medium uppercase',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        {active &&
          (dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  )
}
