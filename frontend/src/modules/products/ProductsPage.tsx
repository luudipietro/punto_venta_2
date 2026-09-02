import { useState } from 'react'
import { toast } from 'sonner'
import { LayoutGrid, List, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { useCategories } from '@/hooks/useCategories'
import { useBrands } from '@/hooks/useBrands'
import { useCreateProduct, useDeleteProduct, useProducts, useUpdateProduct } from '@/hooks/useProducts'
import { formatCurrency } from '@/lib/format'
import { resolveDisplayPrice, priceColorClass } from '@/lib/pricingDisplay'
import { uploadProductImage } from '@/api/product'
import type { ProductInput } from '@/api/product'
import { ProductGallery } from '@/modules/products/ProductGallery'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { usePricingDisplayStore } from '@/stores/pricingDisplayStore'
import { PricingDisplaySelector } from '@/components/PricingDisplaySelector'

type ViewMode = 'list' | 'grid'

const emptyInput: ProductInput = {
  name: '',
  category_id: null,
  brand_id: null,
  cost: 0,
  price: 0,
  description: '',
  image_url: '',
  hidden_from_storefront: false,
  price_hidden_from_storefront: false,
}

export function ProductsPage() {
  const { data: products, isLoading } = useProducts()
  const { data: categories } = useCategories()
  const { data: brands } = useBrands()
  const { data: paymentMethods } = usePaymentMethods()
  const selectedPaymentMethodId = usePricingDisplayStore((s) => s.selectedPaymentMethodId)
  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct()
  const removeMutation = useDeleteProduct()

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ProductInput>(emptyInput)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [uploadingImage, setUploadingImage] = useState(false)

  async function handleImageFile(file: File | undefined) {
    if (!file) return
    setUploadingImage(true)
    try {
      const url = await uploadProductImage(file)
      setForm((prev) => ({ ...prev, image_url: url }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la imagen')
    } finally {
      setUploadingImage(false)
    }
  }

  function openCreateDialog() {
    setEditingId(null)
    setForm(emptyInput)
    setOpen(true)
  }

  function openEditDialog(product: {
    id: number
    name: string
    category_id: number | null
    brand_id: number | null
    cost: number
    price: number
    description: string | null
    image_url: string | null
    hidden_from_storefront: boolean
    price_hidden_from_storefront: boolean
  }) {
    setEditingId(product.id)
    setForm({
      name: product.name,
      category_id: product.category_id,
      brand_id: product.brand_id,
      cost: product.cost,
      price: product.price,
      description: product.description ?? '',
      image_url: product.image_url ?? '',
      hidden_from_storefront: product.hidden_from_storefront,
      price_hidden_from_storefront: product.price_hidden_from_storefront,
    })
    setOpen(true)
  }

  async function handleSubmit() {
    try {
      if (editingId === null) {
        await createMutation.mutateAsync(form)
        toast.success('Producto creado')
      } else {
        await updateMutation.mutateAsync({ id: editingId, payload: form })
        toast.success('Producto actualizado')
      }
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
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
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>Nuevo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId === null ? 'Nuevo producto' : 'Editar producto'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label>Categoría</Label>
                    <Select
                      value={form.category_id ? String(form.category_id) : 'none'}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          category_id: value === 'none' ? null : Number(value),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Elegir" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin categoría</SelectItem>
                        {categories?.map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Marca</Label>
                    <Select
                      value={form.brand_id ? String(form.brand_id) : 'none'}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          brand_id: value === 'none' ? null : Number(value),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Elegir" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin marca</SelectItem>
                        {brands?.map((brand) => (
                          <SelectItem key={brand.id} value={String(brand.id)}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="cost">Costo</Label>
                    <Input
                      id="cost"
                      type="number"
                      min={0}
                      value={form.cost || ''}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, cost: Number(event.target.value) || 0 }))
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="price">Precio</Label>
                    <Input
                      id="price"
                      type="number"
                      min={0}
                      value={form.price || ''}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, price: Number(event.target.value) || 0 }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="description">Descripción</Label>
                  <Input
                    id="description"
                    value={form.description ?? ''}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Imagen</Label>
                  <div className="flex items-center gap-2">
                    {form.image_url ? (
                      <img
                        src={form.image_url}
                        alt=""
                        className="size-10 shrink-0 rounded-md border object-cover"
                        onError={(event) => {
                          event.currentTarget.style.visibility = 'hidden'
                        }}
                      />
                    ) : (
                      <div className="size-10 shrink-0 rounded-md border bg-muted" />
                    )}
                    <Input
                      id="image-file"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={uploadingImage}
                      onChange={(event) => handleImageFile(event.target.files?.[0])}
                      className="flex-1"
                    />
                  </div>
                  {uploadingImage && <p className="text-xs text-muted-foreground">Subiendo imagen...</p>}
                  <Input
                    id="image-url"
                    placeholder="o pegar una URL"
                    value={form.image_url ?? ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, image_url: event.target.value }))}
                  />
                </div>
                <div className="grid gap-2 rounded-md border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Catálogo online</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.hidden_from_storefront ?? false}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, hidden_from_storefront: event.target.checked }))
                      }
                    />
                    No mostrar este producto en el catálogo online
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.price_hidden_from_storefront ?? false}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          price_hidden_from_storefront: event.target.checked,
                        }))
                      }
                    />
                    Ocultar el precio en el catálogo online (muestra "Consultar precio")
                  </label>
                </div>
                {editingId !== null ? (
                  <ProductGallery productId={editingId} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Guardá el producto para agregar más fotos a la galería.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    createMutation.isPending || updateMutation.isPending || uploadingImage || !form.name
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
      ) : viewMode === 'grid' ? (
        products?.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => {
              const { price: gridDisplayPrice, method: gridMethod } = resolveDisplayPrice(
                product.price,
                selectedPaymentMethodId,
                paymentMethods,
              )
              return (
              <Card key={product.id} className="gap-2 p-3">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt=""
                    className="aspect-square w-full rounded-md border object-cover"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                ) : (
                  <div className="aspect-square w-full rounded-md border bg-muted" />
                )}
                <p className="truncate text-sm font-medium">{product.name}</p>
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
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Costo</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products?.length ? (
              products.map((product) => {
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
                  <TableCell>{product.name}</TableCell>
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
