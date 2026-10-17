import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useProducts } from '@/hooks/useProducts'
import { useProductImages } from '@/hooks/useProductImages'
import { useCategories } from '@/hooks/useCategories'
import { useBrands } from '@/hooks/useBrands'
import { useStocks } from '@/hooks/useStocks'
import { useBranches } from '@/hooks/useBranches'
import { useColors } from '@/hooks/useColors'
import { useSizes } from '@/hooks/useSizes'
import { formatCurrency } from '@/lib/format'
import { getMediaUrl } from '@/lib/media'
import { useAuthStore } from '@/stores/authStore'

interface Props {
  productId: number | null
  onOpenChange: (open: boolean) => void
}

/** Read-only product "card": every photo (cover + gallery, with arrows) and
 * all the product's data, without going through the edit form. Shared by the
 * sale picker, the product list and the stock list. */
export function ProductDetailDialog({ productId, onOpenChange }: Props) {
  const open = productId !== null
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const { data: products } = useProducts()
  const { data: gallery } = useProductImages(productId)
  const { data: categories } = useCategories()
  const { data: brands } = useBrands()
  const { data: stocks } = useStocks()
  const { data: branches } = useBranches()
  const { data: colors } = useColors()
  const { data: sizes } = useSizes()
  const [index, setIndex] = useState(0)

  const product = products?.find((p) => p.id === productId)

  const photos = useMemo(() => {
    const urls = [product?.image_url, ...(gallery ?? []).map((g) => g.url)]
      .map((url) => getMediaUrl(url))
      .filter(Boolean)
    return Array.from(new Set(urls))
  }, [product?.image_url, gallery])

  useEffect(() => setIndex(0), [productId])

  const variants = (stocks ?? []).filter((s) => s.product_id === productId)
  const shownIndex = Math.min(index, Math.max(photos.length - 1, 0))

  function step(delta: number) {
    setIndex((shownIndex + delta + photos.length) % photos.length)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product?.name ?? 'Producto'}</DialogTitle>
        </DialogHeader>
        {product && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="relative aspect-square w-full overflow-hidden rounded-md border bg-muted">
                {photos.length > 0 ? (
                  <img
                    key={photos[shownIndex]}
                    src={photos[shownIndex]}
                    alt={product.name}
                    className="size-full animate-in fade-in object-contain duration-300"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                    Sin imagen
                  </div>
                )}
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Foto anterior"
                      onClick={() => step(-1)}
                      className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Foto siguiente"
                      onClick={() => step(1)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                    >
                      <ChevronRight className="size-5" />
                    </button>
                  </>
                )}
              </div>
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {photos.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setIndex(i)}
                      className={`size-14 shrink-0 overflow-hidden rounded-md border-2 ${
                        i === shownIndex ? 'border-primary' : 'border-transparent'
                      }`}
                    >
                      <img src={url} alt="" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 text-sm">
              <p className="text-2xl font-bold">{formatCurrency(product.price)}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">
                  {categories?.find((c) => c.id === product.category_id)?.name ?? 'Sin categoría'}
                </Badge>
                <Badge variant="secondary">
                  {brands?.find((b) => b.id === product.brand_id)?.name ?? 'Sin marca'}
                </Badge>
                {product.hidden_from_storefront && <Badge variant="outline">Oculto en tienda</Badge>}
                {product.price_hidden_from_storefront && (
                  <Badge variant="outline">Precio oculto en tienda</Badge>
                )}
              </div>
              {isAdmin && (
                <p className="text-muted-foreground">Costo: {formatCurrency(product.cost)}</p>
              )}
              {product.description && (
                <p className="whitespace-pre-wrap text-muted-foreground">{product.description}</p>
              )}
              <div>
                <p className="mb-1 font-medium">Stock</p>
                {variants.length === 0 ? (
                  <p className="text-muted-foreground">Sin stock cargado</p>
                ) : (
                  <ul className="space-y-1">
                    {variants.map((stock) => {
                      const color = colors?.find((c) => c.id === stock.color_id)
                      const size = sizes?.find((s) => s.id === stock.size_id)
                      return (
                        <li key={stock.id} className="flex items-center gap-2">
                          {color && (
                            <span
                              className="size-3 shrink-0 rounded-full border"
                              style={{ backgroundColor: color.hex_code }}
                            />
                          )}
                          <span className="flex-1 truncate">
                            {[color?.name, size?.label].filter(Boolean).join(' / ') || 'Único'}
                            <span className="text-muted-foreground">
                              {' · '}
                              {branches?.find((b) => b.id === stock.branch_id)?.name}
                            </span>
                          </span>
                          <span className="font-medium">{stock.quantity}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
