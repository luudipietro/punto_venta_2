import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, ShoppingCart, X } from 'lucide-react'
import type { StorefrontProduct, StorefrontVariant } from '@/api/storefront'
import { formatPriceOrConsult } from '@/lib/format'
import { useCartStore } from '@/stores/cartStore'

interface Props {
  product: StorefrontProduct | null
  onClose: () => void
  onAdded: () => void
}

/** `null` when the variant carries no color/size info at all (a product
 * with a single, plain stock row) — nothing worth showing on a cart line. */
function variantLabel(variant: StorefrontVariant): string | null {
  return [variant.color_name, variant.size_label].filter(Boolean).join(' / ') || null
}

/** A native <dialog> instead of a hand-rolled modal or a library like
 * radix-ui — the admin frontend uses radix's Dialog, but this app is
 * deliberately dependency-light (see storefront/package.json), and
 * <dialog>'s built-in focus trap/Escape-to-close/backdrop cover everything
 * a product detail popup needs for free. */
export function ProductDetailDialog({ product, onClose, onAdded }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selectedVariant, setSelectedVariant] = useState<StorefrontVariant | null>(null)
  const [quantity, setQuantity] = useState(1)
  const addLine = useCartStore((state) => state.addLine)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (product) {
      setSelectedVariant(product.variants[0] ?? null)
      setQuantity(1)
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [product])

  if (!product) return null

  const hasVariantChoice = product.variants.length > 1
  const hasVariants = product.variants.length > 0
  const canAdd = product.in_stock && (!hasVariants || selectedVariant !== null)
  const maxQuantity = selectedVariant?.quantity

  function handleAddToCart() {
    if (!product || !canAdd) return
    addLine(
      {
        key: `${product.id}:${selectedVariant?.stock_id ?? 'none'}`,
        productId: product.id,
        productName: product.name,
        imageUrl: product.image_url,
        price: product.price,
        variantLabel: selectedVariant ? variantLabel(selectedVariant) : null,
      },
      quantity,
    )
    onAdded()
    dialogRef.current?.close()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border bg-card text-card-foreground backdrop:bg-black/50"
    >
      <div className="max-h-[85vh] overflow-y-auto p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{product.name}</h2>
          <button
            onClick={() => dialogRef.current?.close()}
            aria-label="Cerrar"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="mb-4 aspect-square w-full rounded-lg border border-border object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        )}

        {product.description && (
          <p className="mb-3 text-sm text-muted-foreground">{product.description}</p>
        )}

        <p className="mb-4 text-xl font-bold text-primary">{formatPriceOrConsult(product.price)}</p>

        {hasVariantChoice && (
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium">Elegí una opción</p>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((variant) => {
                const selected = selectedVariant?.stock_id === variant.stock_id
                return (
                  <button
                    key={variant.stock_id}
                    onClick={() => setSelectedVariant(variant)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {variantLabel(variant)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!product.in_stock && (
          <p className="mb-4 text-sm font-medium text-destructive">Sin stock por el momento</p>
        )}

        {product.in_stock && (
          <div className="mb-4 flex items-center gap-3">
            <p className="text-sm font-medium">Cantidad</p>
            <div className="flex items-center rounded-lg border border-border">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Restar"
                className="p-2 hover:bg-accent"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-8 text-center text-sm font-medium">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => (maxQuantity ? Math.min(maxQuantity, q + 1) : q + 1))}
                aria-label="Sumar"
                className="p-2 hover:bg-accent"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        )}

        <button
          onClick={handleAddToCart}
          disabled={!canAdd}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          <ShoppingCart className="size-5" />
          {product.in_stock ? 'Agregar al carrito' : 'Sin stock'}
        </button>
      </div>
    </dialog>
  )
}
