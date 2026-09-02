import type { StorefrontProduct } from '@/api/storefront'
import { formatPriceOrConsult } from '@/lib/format'

interface Props {
  product: StorefrontProduct
  onSelect: (product: StorefrontProduct) => void
}

export function ProductCard({ product, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(product)}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left text-card-foreground shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="aspect-square w-full overflow-hidden bg-muted">
        {product.image_url ? (
          <img
            src={product.image_url}
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
    </button>
  )
}
