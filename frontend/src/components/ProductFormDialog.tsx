import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBrands } from '@/hooks/useBrands'
import { useBranches } from '@/hooks/useBranches'
import { useCategories } from '@/hooks/useCategories'
import { useColors } from '@/hooks/useColors'
import { useSizes } from '@/hooks/useSizes'
import { useCreateProduct, useUpdateProduct } from '@/hooks/useProducts'
import { useCreateStock } from '@/hooks/useStocks'
import { CurrencyInput } from '@/components/CurrencyInput'
import { uploadProductImage } from '@/api/product'
import type { Product, ProductInput } from '@/api/product'
import { ProductGallery } from '@/modules/products/ProductGallery'
import { getMediaUrl } from '@/lib/media'
import { useAuthStore } from '@/stores/authStore'

const NONE = 'none'

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

function toInput(product: Product): ProductInput {
  return {
    name: product.name,
    category_id: product.category_id,
    brand_id: product.brand_id,
    cost: product.cost,
    price: product.price,
    description: product.description ?? '',
    image_url: product.image_url ?? '',
    hidden_from_storefront: product.hidden_from_storefront,
    price_hidden_from_storefront: product.price_hidden_from_storefront,
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Product being edited; `null` means create a new one. */
  product: Product | null
  onSaved?: (product: Product) => void
}

/** Create/edit product form. In create mode it can also create the first
 * stock row in the same step ("Cargar stock ahora"), so a product that was
 * never loaded can be sold right away without a second trip to /stock. */
export function ProductFormDialog({ open, onOpenChange, product, onSaved }: Props) {
  const { data: categories } = useCategories()
  const { data: brands } = useBrands()
  const { data: branches } = useBranches()
  const { data: colors } = useColors()
  const { data: sizes } = useSizes()
  const activeBranchId = useAuthStore((s) => s.activeBranchId)
  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct()
  const createStock = useCreateStock()

  const [form, setForm] = useState<ProductInput>(emptyInput)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [withStock, setWithStock] = useState(false)
  const [stockBranchId, setStockBranchId] = useState<number | null>(null)
  const [stockColorId, setStockColorId] = useState<number | null>(null)
  const [stockSizeId, setStockSizeId] = useState<number | null>(null)
  const [stockQuantity, setStockQuantity] = useState(1)

  const editingId = product?.id ?? null

  useEffect(() => {
    if (!open) return
    setForm(product ? toInput(product) : emptyInput)
    setWithStock(false)
    setStockBranchId(activeBranchId)
    setStockColorId(null)
    setStockSizeId(null)
    setStockQuantity(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id])

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

  const stockInvalid = editingId === null && withStock && (stockBranchId === null || stockQuantity < 1)

  async function handleSubmit() {
    try {
      let saved: Product
      if (editingId === null) {
        saved = await createMutation.mutateAsync(form)
        if (withStock && stockBranchId !== null) {
          try {
            await createStock.mutateAsync({
              product_id: saved.id,
              color_id: stockColorId,
              size_id: stockSizeId,
              branch_id: stockBranchId,
              quantity: stockQuantity,
            })
            toast.success('Producto y stock creados')
          } catch (error) {
            toast.error(
              `Producto creado, pero no se pudo cargar el stock: ${
                error instanceof Error ? error.message : 'error desconocido'
              }`,
            )
          }
        } else {
          toast.success('Producto creado')
        }
      } else {
        saved = await updateMutation.mutateAsync({ id: editingId, payload: form })
        toast.success('Producto actualizado')
      }
      onOpenChange(false)
      onSaved?.(saved)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  const pending = createMutation.isPending || updateMutation.isPending || createStock.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                value={form.category_id ? String(form.category_id) : NONE}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, category_id: value === NONE ? null : Number(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin categoría</SelectItem>
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
                value={form.brand_id ? String(form.brand_id) : NONE}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, brand_id: value === NONE ? null : Number(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin marca</SelectItem>
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
              <CurrencyInput
                id="cost"
                value={form.cost}
                onValueChange={(value) => setForm((prev) => ({ ...prev, cost: value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="price">Precio</Label>
              <CurrencyInput
                id="price"
                value={form.price}
                onValueChange={(value) => setForm((prev) => ({ ...prev, price: value }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="description">Descripción</Label>
            <Input
              id="description"
              value={form.description ?? ''}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Imagen</Label>
            <div className="flex items-center gap-2">
              {form.image_url ? (
                <img
                  src={getMediaUrl(form.image_url)}
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
                  setForm((prev) => ({ ...prev, price_hidden_from_storefront: event.target.checked }))
                }
              />
              Ocultar el precio en el catálogo online (muestra "Consultar precio")
            </label>
          </div>

          {editingId !== null ? (
            <ProductGallery productId={editingId} />
          ) : (
            <>
              <div className="grid gap-3 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={withStock}
                    onChange={(event) => setWithStock(event.target.checked)}
                  />
                  Cargar stock ahora
                </label>
                {withStock && (
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label>Sucursal</Label>
                      <Select
                        value={stockBranchId !== null ? String(stockBranchId) : undefined}
                        onValueChange={(value) => setStockBranchId(Number(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Elegir sucursal" />
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
                        <Label>Color</Label>
                        <Select
                          value={stockColorId !== null ? String(stockColorId) : NONE}
                          onValueChange={(value) => setStockColorId(value === NONE ? null : Number(value))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sin color" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Sin color</SelectItem>
                            {colors?.map((color) => (
                              <SelectItem key={color.id} value={String(color.id)}>
                                {color.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Talle</Label>
                        <Select
                          value={stockSizeId !== null ? String(stockSizeId) : NONE}
                          onValueChange={(value) => setStockSizeId(value === NONE ? null : Number(value))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sin talle" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Sin talle</SelectItem>
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
                      <Label htmlFor="stock-quantity">Cantidad</Label>
                      <Input
                        id="stock-quantity"
                        type="number"
                        min={1}
                        value={stockQuantity || ''}
                        onChange={(event) => setStockQuantity(Number(event.target.value) || 0)}
                      />
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Guardá el producto para agregar más fotos a la galería.
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={pending || uploadingImage || !form.name || stockInvalid}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
