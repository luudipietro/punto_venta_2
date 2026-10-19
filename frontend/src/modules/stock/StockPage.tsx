import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LayoutGrid, List, Minus, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/SearchableSelect'
import { SortableHead } from '@/components/SortableHead'
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
import { useAuthStore } from '@/stores/authStore'
import type { Stock, StockInput } from '@/api/stock'
import { getMediaUrl } from '@/lib/media'
import { ProductDetailDialog } from '@/components/ProductDetailDialog'

type ViewMode = 'list' | 'grid'

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
  const activeBranchId = useAuthStore((s) => s.activeBranchId)

  const createMutation = useCreateStock()
  const removeMutation = useDeleteStock()
  const increaseMutation = useIncreaseStock()
  const decreaseMutation = useDecreaseStock()

  const [open, setOpen] = useState(false)
  const [detailProductId, setDetailProductId] = useState<number | null>(null)
  const [form, setForm] = useState<StockInput>(emptyInput)
  const [pendingAdjustment, setPendingAdjustment] = useState<{
    stockId: number
    delta: 1 | -1
    productName: string
  } | null>(null)
  const [adjustAmount, setAdjustAmount] = useState(1)
  const [duplicateStock, setDuplicateStock] = useState<Stock | null>(null)

  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState<number | 'all'>('all')
  const [sortField, setSortField] = useState<'name' | 'quantity' | 'branch'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [viewMode, setViewMode] = useState<ViewMode>('list')

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
    setForm({ ...emptyInput, branch_id: activeBranchId ?? 0 })
    setOpen(true)
  }

  function findMatchingStock(input: StockInput): Stock | undefined {
    return stocks?.find(
      (stock) =>
        stock.product_id === input.product_id &&
        stock.branch_id === input.branch_id &&
        (stock.color_id ?? null) === (input.color_id ?? null) &&
        (stock.size_id ?? null) === (input.size_id ?? null),
    )
  }

  async function handleSubmit() {
    const existing = findMatchingStock(form)
    if (existing) {
      setOpen(false)
      setDuplicateStock(existing)
      return
    }
    try {
      await createMutation.mutateAsync(form)
      toast.success('Stock creado')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  async function confirmMergeDuplicate() {
    if (!duplicateStock) return
    try {
      await increaseMutation.mutateAsync({ id: duplicateStock.id, amount: form.quantity })
      toast.success('Cantidad sumada al stock existente')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    } finally {
      setDuplicateStock(null)
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

  function openAdjustment(adjustment: NonNullable<typeof pendingAdjustment>) {
    setAdjustAmount(1)
    setPendingAdjustment(adjustment)
  }

  async function confirmPendingAdjustment() {
    if (!pendingAdjustment) return
    const { stockId, delta } = pendingAdjustment
    const amount = Math.floor(adjustAmount)
    if (!(amount >= 1)) return
    try {
      if (delta === 1) await increaseMutation.mutateAsync({ id: stockId, amount })
      else await decreaseMutation.mutateAsync({ id: stockId, amount })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    } finally {
      setPendingAdjustment(null)
    }
  }

  return (
    <div>
      <ProductDetailDialog
        productId={detailProductId}
        onOpenChange={(open) => !open && setDetailProductId(null)}
      />
      <PageHeader
        title="Stock"
        action={
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={
                  'size-9 rounded-none ' + (viewMode === 'list' ? 'bg-accent' : 'text-muted-foreground')
                }
                onClick={() => setViewMode('list')}
                aria-label="Ver como lista"
              >
                <List className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={
                  'size-9 rounded-none ' + (viewMode === 'grid' ? 'bg-accent' : 'text-muted-foreground')
                }
                onClick={() => setViewMode('grid')}
                aria-label="Ver como tarjetas"
              >
                <LayoutGrid className="size-4" />
              </Button>
            </div>
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
                  <SearchableSelect
                    value={form.product_id ? String(form.product_id) : undefined}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, product_id: Number(value) }))}
                    placeholder="Elegir"
                    searchPlaceholder="Buscar producto..."
                    options={products?.map((product) => ({ value: String(product.id), label: product.name })) ?? []}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Sucursal</Label>
                  <p className="text-sm text-muted-foreground">
                    {branches?.find((branch) => branch.id === form.branch_id)?.name ?? '-'}
                  </p>
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
          </div>
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
      ) : viewMode === 'grid' ? (
        visibleRows.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleRows.map(({ stock, product, productName, color, variant, branchName }) => (
              <Card key={stock.id} className="gap-2 p-3">
                {product?.image_url ? (
                  <img
                    src={getMediaUrl(product.image_url)}
                    alt=""
                    onClick={() => setDetailProductId(product.id)}
                    className="aspect-square w-full cursor-pointer rounded-md border object-cover"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                ) : (
                  <div className="aspect-square w-full rounded-md border bg-muted" />
                )}
                <p
                  onClick={() => product && setDetailProductId(product.id)}
                  className="cursor-pointer truncate text-sm font-medium hover:underline"
                >
                  {productName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
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
                    'Sin variante'
                  )}
                  {branchName ? ` · ${branchName}` : ''}
                </p>
                <p className="text-sm font-semibold">{stock.quantity} unidades</p>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openAdjustment({ stockId: stock.id, delta: -1, productName })}
                    disabled={stock.quantity <= 0}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openAdjustment({ stockId: stock.id, delta: 1, productName })}
                  >
                    <Plus className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(stock.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Sin stock cargado</p>
        )
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
                        src={getMediaUrl(product.image_url)}
                        alt=""
                        onClick={() => setDetailProductId(product.id)}
                        className="size-9 cursor-pointer rounded-md border object-cover"
                        onError={(event) => {
                          event.currentTarget.style.visibility = 'hidden'
                        }}
                      />
                    ) : (
                      <div className="size-9 rounded-md border bg-muted" />
                    )}
                  </TableCell>
                  <TableCell
                    onClick={() => product && setDetailProductId(product.id)}
                    className="cursor-pointer hover:underline"
                  >
                    {productName}
                  </TableCell>
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
                        openAdjustment({ stockId: stock.id, delta: -1, productName })
                      }
                      disabled={stock.quantity <= 0}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        openAdjustment({ stockId: stock.id, delta: 1, productName })
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
              {pendingAdjustment?.delta === 1 ? 'Sumar' : 'Restar'} stock
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAdjustment?.delta === 1
                ? `Se va a sumar stock a "${pendingAdjustment?.productName}".`
                : `Se va a restar stock a "${pendingAdjustment?.productName}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="adjust-amount">Cantidad</Label>
            <Input
              id="adjust-amount"
              type="number"
              min={1}
              step={1}
              autoFocus
              value={adjustAmount || ''}
              onChange={(event) => setAdjustAmount(Number(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirmPendingAdjustment()
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingAdjustment} disabled={!(adjustAmount >= 1)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={duplicateStock !== null}
        onOpenChange={(isOpen) => !isOpen && setDuplicateStock(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esta variante ya tiene stock</AlertDialogTitle>
            <AlertDialogDescription>
              Ya existe stock para ese producto/color/talle en esa sucursal, con{' '}
              {duplicateStock?.quantity} unidades. ¿Sumar {form.quantity} más en vez de crear una
              fila nueva?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMergeDuplicate}>Sumar cantidad</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
