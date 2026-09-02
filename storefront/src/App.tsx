import { useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { SearchAndFilters } from '@/components/SearchAndFilters'
import { ProductGrid } from '@/components/ProductGrid'
import { ProductDetailDialog } from '@/components/ProductDetailDialog'
import { CartDialog } from '@/components/CartDialog'
import { useStorefrontProducts } from '@/hooks/useStorefrontProducts'
import { useBrandSettings } from '@/hooks/useBrandSettings'
import { useBrandTheme } from '@/theme/useBrandTheme'
import type { StorefrontProduct } from '@/api/storefront'

export function App() {
  const { data: products, isLoading, isError } = useStorefrontProducts()
  const { data: brand } = useBrandSettings()
  useBrandTheme(brand?.colors)

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null)
  const [cartOpen, setCartOpen] = useState(false)

  const categories = useMemo(() => {
    if (!products) return []
    const names = products.map((product) => product.category_name).filter((name) => name !== null)
    return Array.from(new Set(names)).sort()
  }, [products])

  const filteredProducts = useMemo(() => {
    if (!products) return []
    const term = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesSearch = !term || product.name.toLowerCase().includes(term)
      const matchesCategory = !selectedCategory || product.category_name === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [products, search, selectedCategory])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header brand={brand} onOpenCart={() => setCartOpen(true)} />
      <SearchAndFilters
        search={search}
        onSearchChange={setSearch}
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
      />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {isLoading && (
          <p className="py-16 text-center text-sm text-muted-foreground">Cargando productos...</p>
        )}
        {isError && (
          <p className="py-16 text-center text-sm text-destructive">
            No pudimos cargar el catálogo. Probá de nuevo en un momento.
          </p>
        )}
        {products && <ProductGrid products={filteredProducts} onSelect={setSelectedProduct} />}
      </main>
      <ProductDetailDialog
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdded={() => {
          setSelectedProduct(null)
          setCartOpen(true)
        }}
      />
      <CartDialog
        open={cartOpen}
        whatsappNumber={brand?.whatsapp_number ?? null}
        onClose={() => setCartOpen(false)}
      />
    </div>
  )
}
