import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CurrencyInput } from '@/components/CurrencyInput'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBrands } from '@/hooks/useBrands'
import { useCategories } from '@/hooks/useCategories'
import { useCreateProduct } from '@/hooks/useProducts'
import type { Product } from '@/api/product'

const NONE_SENTINEL = 'none'

interface ProductQuickCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (product: Product) => void
}

/** Minimal product-creation form embeddable inside another flow (here, the
 * Purchase dialog) — no image/gallery, just enough fields to get a usable
 * product_id. Full editing still happens on /productos. */
export function ProductQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: ProductQuickCreateDialogProps) {
  const { data: categories } = useCategories()
  const { data: brands } = useBrands()
  const createMutation = useCreateProduct()

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [brandId, setBrandId] = useState<number | null>(null)
  const [cost, setCost] = useState(0)
  const [price, setPrice] = useState(0)

  function reset() {
    setName('')
    setCategoryId(null)
    setBrandId(null)
    setCost(0)
    setPrice(0)
  }

  const canSubmit = name.trim() !== ''

  async function handleSubmit() {
    try {
      const product = await createMutation.mutateAsync({
        name,
        category_id: categoryId,
        brand_id: brandId,
        cost,
        price,
      })
      toast.success('Producto creado')
      reset()
      onCreated(product)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) reset()
        onOpenChange(isOpen)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear producto nuevo</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="quick-product-name">Nombre</Label>
            <Input id="quick-product-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Categoría</Label>
              <Select
                value={categoryId !== null ? String(categoryId) : NONE_SENTINEL}
                onValueChange={(value) =>
                  setCategoryId(value === NONE_SENTINEL ? null : Number(value))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>Sin categoría</SelectItem>
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
                value={brandId !== null ? String(brandId) : NONE_SENTINEL}
                onValueChange={(value) => setBrandId(value === NONE_SENTINEL ? null : Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin marca" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>Sin marca</SelectItem>
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
              <Label htmlFor="quick-product-cost">Costo</Label>
              <CurrencyInput id="quick-product-cost" value={cost} onValueChange={setCost} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quick-product-price">Precio</Label>
              <CurrencyInput id="quick-product-price" value={price} onValueChange={setPrice} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!canSubmit || createMutation.isPending}>
            Crear y continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
