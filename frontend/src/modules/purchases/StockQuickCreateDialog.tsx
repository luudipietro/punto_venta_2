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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBranches } from '@/hooks/useBranches'
import { useColors } from '@/hooks/useColors'
import { useProducts } from '@/hooks/useProducts'
import { useSizes } from '@/hooks/useSizes'
import { useCreateStock } from '@/hooks/useStocks'
import type { Stock } from '@/api/stock'

const NONE_SENTINEL = 'none'

interface StockQuickCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  branchId: number
  presetProductId?: number
  onCreated: (stock: Stock) => void
}

/** Minimal stock-variant-creation form embeddable inside another flow (here,
 * the Purchase dialog) — starts at quantity 0, since the purchase itself is
 * about to increase it. Branch is fixed to the purchase's own branch (no
 * selector); product is locked when chained from creating a new product,
 * otherwise pickable. Deliberately skips StockPage.tsx's duplicate-variant
 * merge check — here the cashier is intentionally creating a new variant. */
export function StockQuickCreateDialog({
  open,
  onOpenChange,
  branchId,
  presetProductId,
  onCreated,
}: StockQuickCreateDialogProps) {
  const { data: branches } = useBranches()
  const { data: products } = useProducts()
  const { data: colors } = useColors()
  const { data: sizes } = useSizes()
  const createMutation = useCreateStock()

  const [productId, setProductId] = useState<number | null>(null)
  const [colorId, setColorId] = useState<number | null>(null)
  const [sizeId, setSizeId] = useState<number | null>(null)

  useEffect(() => {
    if (open) setProductId(presetProductId ?? null)
  }, [open, presetProductId])

  function reset() {
    setProductId(null)
    setColorId(null)
    setSizeId(null)
  }

  const canSubmit = productId !== null

  async function handleSubmit() {
    if (productId === null) return
    try {
      const stock = await createMutation.mutateAsync({
        product_id: productId,
        color_id: colorId,
        size_id: sizeId,
        branch_id: branchId,
        quantity: 0,
      })
      toast.success('Variante de stock creada')
      reset()
      onCreated(stock)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  const branchName = branches?.find((branch) => branch.id === branchId)?.name ?? '-'

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
          <DialogTitle>Crear variante de stock nueva</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Producto</Label>
            {presetProductId !== undefined ? (
              <p className="text-sm">{products?.find((p) => p.id === presetProductId)?.name}</p>
            ) : (
              <Select
                value={productId !== null ? String(productId) : undefined}
                onValueChange={(value) => setProductId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir producto" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={String(product.id)}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Color</Label>
              <Select
                value={colorId !== null ? String(colorId) : NONE_SENTINEL}
                onValueChange={(value) => setColorId(value === NONE_SENTINEL ? null : Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin color" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>Sin color</SelectItem>
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
                value={sizeId !== null ? String(sizeId) : NONE_SENTINEL}
                onValueChange={(value) => setSizeId(value === NONE_SENTINEL ? null : Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin talle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>Sin talle</SelectItem>
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
            <Label>Sucursal</Label>
            <p className="text-sm text-muted-foreground">{branchName}</p>
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
