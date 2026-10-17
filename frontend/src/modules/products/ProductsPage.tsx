import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LayoutGrid, List, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SortableHead } from '@/components/SortableHead'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCategories } from '@/hooks/useCategories'
import { useBrands } from '@/hooks/useBrands'
import { useDeleteProduct, useProducts } from '@/hooks/useProducts'
import { formatCurrency } from '@/lib/format'
import { resolveDisplayPrice, priceColorClass } from '@/lib/pricingDisplay'
import type { Product } from '@/api/product'
import { ProductFormDialog } from '@/components/ProductFormDialog'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { usePricingDisplayStore } from '@/stores/pricingDisplayStore'
import { PricingDisplaySelector } from '@/components/PricingDisplaySelector'
import { getMediaUrl } from '@/lib/media'
import { ProductDetailDialog } from '@/components/ProductDetailDialog'

type ViewMode = 'list' | 'grid'

export function ProductsPage() {
  const { data: products, isLoading } = useProducts()
  const { data: categories } = useCategories()
  const { data: brands } = useBrands()
  const { data: paymentMethods } = usePaymentMethods()
  const selectedPaymentMethodId = usePricingDisplayStore((s) => s.selectedPaymentMethodId)
  const removeMutation = useDeleteProduct()

  const [open, setOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [detailProductId, setDetailProductId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'name' | 'category' | 'brand' | 'cost' | 'price'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(field: typeof sortField) {
    if (field === sortField) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const visibleProducts = useMemo(() => {
    if (!products) return []
    const term = search.trim().toLowerCase()
    const filtered = term ? products.filter((product) => product.name.toLowerCase().includes(term)) : products
    const categoryName = (id: number | null) => categories?.find((c) => c.id === id)?.name ?? ''
    const brandName = (id: number | null) => brands?.find((b) => b.id === id)?.name ?? ''
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0
      if (sortField === 'name') comparison = a.name.localeCompare(b.name)
      else if (sortField === 'category') comparison = categoryName(a.category_id).localeCompare(categoryName(b.category_id))
      else if (sortField === 'brand') comparison = brandName(a.brand_id).localeCompare(brandName(b.brand_id))
      else if (sortField === 'cost') comparison = a.cost - b.cost
      else comparison = a.price - b.price
      return sortDir === 'asc' ? comparison : -comparison
    })
    return sorted
  }, [products, categories, brands, search, sortField, sortDir])

  function openCreateDialog() {
    setEditingProduct(null)
    setOpen(true)
  }

  function openEditDialog(product: Product) {
    setEditingProduct(product)
    setOpen(true)
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este producto?')) return
    try {
      await removeMutation.mutateAsync(id)
      toast.success('Producto eliminado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  return (
    <div>
      <ProductFormDialog open={open} onOpenChange={setOpen} product={editingProduct} />
      <ProductDetailDialog
        productId={detailProductId}
        onOpenChange={(open) => !open && setDetailProductId(null)}
      />
      <PageHeader
        title="Productos"
        action={
          <div className="flex items-center gap-2">
            <PricingDisplaySelector />
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
                aria-label="Ver como grilla"
              >
                <LayoutGrid className="size-4" />
              </Button>
            </div>
            <Button onClick={openCreateDialog}>Nuevo</Button>
          </div>
        }
      />

      <div className="mb-3">
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-64"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : viewMode === 'grid' ? (
        visibleProducts.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleProducts.map((product) => {
              const { price: gridDisplayPrice, method: gridMethod } = resolveDisplayPrice(
                product.price,
                selectedPaymentMethodId,
                paymentMethods,
              )
              return (
              <Card key={product.id} className="gap-2 p-3">
                {product.image_url ? (
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
                  <div
                    onClick={() => setDetailProductId(product.id)}
                    className="aspect-square w-full cursor-pointer rounded-md border bg-muted"
                  />
                )}
                <p
                  onClick={() => setDetailProductId(product.id)}
                  className="cursor-pointer truncate text-sm font-medium hover:underline"
                >
                  {product.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {categories?.find((category) => category.id === product.category_id)?.name ?? '-'}
                  {' · '}
                  {brands?.find((brand) => brand.id === product.brand_id)?.name ?? '-'}
                </p>
                <p className={`text-sm font-semibold ${priceColorClass(gridMethod)}`}>
                  {formatCurrency(gridDisplayPrice)}
                </p>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </Card>
              )
            })}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Sin productos</p>
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14" />
              <SortableHead label="Nombre" active={sortField === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
              <SortableHead label="Categoría" active={sortField === 'category'} dir={sortDir} onClick={() => toggleSort('category')} />
              <SortableHead label="Marca" active={sortField === 'brand'} dir={sortDir} onClick={() => toggleSort('brand')} />
              <SortableHead label="Costo" active={sortField === 'cost'} dir={sortDir} onClick={() => toggleSort('cost')} />
              <SortableHead label="Precio" active={sortField === 'price'} dir={sortDir} onClick={() => toggleSort('price')} />
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProducts.length ? (
              visibleProducts.map((product) => {
                const { price: rowDisplayPrice, method: rowMethod } = resolveDisplayPrice(
                  product.price,
                  selectedPaymentMethodId,
                  paymentMethods,
                )
                return (
                <TableRow key={product.id}>
                  <TableCell>
                    {product.image_url ? (
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
                    onClick={() => setDetailProductId(product.id)}
                    className="cursor-pointer hover:underline"
                  >
                    {product.name}
                  </TableCell>
                  <TableCell>
                    {categories?.find((category) => category.id === product.category_id)?.name ?? '-'}
                  </TableCell>
                  <TableCell>{brands?.find((brand) => brand.id === product.brand_id)?.name ?? '-'}</TableCell>
                  <TableCell>{formatCurrency(product.cost)}</TableCell>
                  <TableCell className={priceColorClass(rowMethod)}>
                    {formatCurrency(rowDisplayPrice)}
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sin productos
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
