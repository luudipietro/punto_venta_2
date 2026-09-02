import type { StorefrontProduct } from '@/api/storefront'
import { ProductCard } from '@/components/ProductCard'

interface Props {
  products: StorefrontProduct[]
  onSelect: (product: StorefrontProduct) => void
}

export function ProductGrid({ products, onSelect }: Props) {
  if (products.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        No encontramos productos que coincidan con la búsqueda.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onSelect={onSelect} />
      ))}
    </div>
  )
}
