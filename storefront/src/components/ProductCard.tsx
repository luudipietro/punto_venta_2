import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { StorefrontProduct } from '@/api/storefront'
import { formatPriceOrConsult } from '@/lib/format'
import { getMediaUrl } from '@/api/client'
import { useCartStore } from '@/stores/cartStore'
import { useCartUiStore } from '@/stores/cartUiStore'

export function ProductCard({ product }: { product: StorefrontProduct }) {
  const navigate = useNavigate()
  const addLine = useCartStore((state) => state.addLine)
  const openCart = useCartUiStore((state) => state.open)

  // A product with a single (or no) variant goes straight into the cart; with
  // several, the customer has to choose one, so we send them to its page.
  function handleQuickAdd(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (product.variants.length > 1) {
      navigate(`/producto/${product.id}`)
      return
    }
    const variant = product.variants[0]
    addLine(
      {
        key: `${product.id}:${variant?.stock_id ?? 'none'}`,
        productId: product.id,
        productName: product.name,
        imageUrl: getMediaUrl(product.image_url) || '',
        price: product.price,
        variantLabel: variant
          ? [variant.color_name, variant.size_label].filter(Boolean).join(' / ') || null
          : null,
      },
      1,
    )
    openCart()
  }

  return (
    <Link
      to={`/producto/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left text-card-foreground shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {product.image_url ? (
          <img
            src={getMediaUrl(product.image_url)}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
            Sin imagen
          </div>
        )}
        {product.in_stock && (
          <button
            type="button"
            onClick={handleQuickAdd}
            aria-label={`Agregar ${product.name} al carrito`}
            className="absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-110"
          >
            <Plus className="size-5" />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {product.category_name && (
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {product.category_name}
          </span>
        )}
        <h3 className="line-clamp-2 text-sm font-medium">{product.name}</h3>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-base font-bold text-primary">{formatPriceOrConsult(product.price)}</span>
          {!product.in_stock && (
            <span className="text-xs font-medium text-destructive">Sin stock</span>
          )}
        </div>
      </div>
    </Link>
  )
}
