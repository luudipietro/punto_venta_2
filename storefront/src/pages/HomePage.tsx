import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CategoryFilter } from '@/components/CategoryFilter'
import { HeroCarousel } from '@/components/HeroCarousel'
import { ProductGrid } from '@/components/ProductGrid'
import { useStorefrontProducts } from '@/hooks/useStorefrontProducts'
import { useBrandSettings } from '@/hooks/useBrandSettings'

export function HomePage() {
  const { data: products, isLoading, isError } = useStorefrontProducts()
  const { data: brand } = useBrandSettings()
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('q') ?? ''
  const selectedCategory = searchParams.get('category')

  function setSelectedCategory(category: string | null) {
    const next = new URLSearchParams(searchParams)
    if (category) next.set('category', category)
    else next.delete('category')
    setSearchParams(next, { replace: true })
  }

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

  // Searching jumps straight to results — the hero banner is promotional,
  // not useful once the customer is already looking for something specific.
  const isSearching = search.trim().length > 0

  return (
    <>
      {!isSearching && <HeroCarousel images={brand?.hero_images ?? []} />}
      {/* The divider sits right after the hero, so the category chips read
          as part of the products section below it, not the hero above. */}
      <div className="border-t border-border">
        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
        <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
          {isLoading && (
            <p className="py-16 text-center text-sm text-muted-foreground">Cargando productos...</p>
          )}
          {isError && (
            <p className="py-16 text-center text-sm text-destructive">
              No pudimos cargar el catálogo. Probá de nuevo en un momento.
            </p>
          )}
          {products && <ProductGrid products={filteredProducts} />}
        </main>
      </div>
    </>
  )
}
