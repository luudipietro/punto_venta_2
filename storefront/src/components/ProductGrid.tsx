import type { StorefrontProduct } from '@/api/storefront'
import { ProductCard } from '@/components/ProductCard'

export function ProductGrid({ products }: { products: StorefrontProduct[] }) {
  if (products.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        No encontramos productos que coincidan con la búsqueda.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
