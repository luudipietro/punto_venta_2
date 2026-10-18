import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigationType, useSearchParams } from 'react-router-dom'
import { CategoryFilter } from '@/components/CategoryFilter'
import { HeroCarousel } from '@/components/HeroCarousel'
import { ProductGrid } from '@/components/ProductGrid'
import { getMediaUrl } from '@/api/client'
import type { StorefrontProduct } from '@/api/storefront'
import { SortSelect, isSortKey, type SortKey } from '@/components/SortSelect'
import { useStorefrontProducts } from '@/hooks/useStorefrontProducts'
import { useBrandSettings } from '@/hooks/useBrandSettings'

const PAGE_SIZE = 12
const SESSION_KEY = 'storefront-home-state'

interface SavedState {
  filterKey: string
  visible: number
  scrollY: number
}

function readSaved(): SavedState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SavedState) : null
  } catch {
    return null
  }
}

function compareProducts(sort: SortKey) {
  return (a: StorefrontProduct, b: StorefrontProduct) => {
    if (sort === 'name-asc') return a.name.localeCompare(b.name, 'es')
    if (sort === 'name-desc') return b.name.localeCompare(a.name, 'es')
    // Price sorts: products with a hidden price ("Consultar precio") go last
    // in either direction.
    if (a.price === null || b.price === null) {
      return a.price === b.price ? 0 : a.price === null ? 1 : -1
    }
    return sort === 'price-asc'
      ? Number(a.price) - Number(b.price)
      : Number(b.price) - Number(a.price)
  }
}

export function HomePage() {
  const { data: products, isLoading, isError } = useStorefrontProducts()
  const { data: brand } = useBrandSettings()
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('q') ?? ''
  const selectedCategory = searchParams.get('category')
  const sortParam = searchParams.get('sort')
  const sort = isSortKey(sortParam) ? sortParam : null

  function setSort(next: SortKey | null) {
    const params = new URLSearchParams(searchParams)
    if (next) params.set('sort', next)
    else params.delete('sort')
    setSearchParams(params, { replace: true })
  }

  // "Ver más" pagination is client-side over the already-loaded list. The
  // visible count + scroll position survive a visit to a product page (kept in
  // sessionStorage, tied to the current filters) so "back" lands in the same
  // spot; changing q/category/sort starts over at the first page.
  const filterKey = `${search}|${selectedCategory ?? ''}|${sort ?? ''}`
  // Only a back/forward (POP) navigation restores; clicking the logo or a
  // link to "/" is a fresh visit and starts at the top.
  const navigationType = useNavigationType()
  const [initialSaved] = useState(() => (navigationType === 'POP' ? readSaved() : null))
  const [visibleState, setVisibleState] = useState({
    filterKey,
    count: initialSaved?.filterKey === filterKey ? initialSaved.visible : PAGE_SIZE,
  })
  const visibleCount = visibleState.filterKey === filterKey ? visibleState.count : PAGE_SIZE
  const scrollRef = useRef(initialSaved?.filterKey === filterKey ? initialSaved.scrollY : 0)
  const restoredRef = useRef(false)
  const latest = useRef({ filterKey, visibleCount })
  latest.current = { filterKey, visibleCount }

  useEffect(() => {
    function onScroll() {
      if (restoredRef.current) scrollRef.current = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      try {
        sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            filterKey: latest.current.filterKey,
            visible: latest.current.visibleCount,
            scrollY: scrollRef.current,
          } satisfies SavedState),
        )
      } catch {
        // storage unavailable — back just lands at the top
      }
    }
  }, [])

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
    const matching = products.filter((product) => {
      const matchesSearch = !term || product.name.toLowerCase().includes(term)
      const matchesCategory = !selectedCategory || product.category_name === selectedCategory
      return matchesSearch && matchesCategory
    })
    return sort ? matching.sort(compareProducts(sort)) : matching
  }, [products, search, selectedCategory, sort])

  const shownProducts = filteredProducts.slice(0, visibleCount)

  // Restore the saved scroll once the list has actually rendered.
  useLayoutEffect(() => {
    if (restoredRef.current || !products) return
    restoredRef.current = true
    if (scrollRef.current > 0) window.scrollTo(0, scrollRef.current)
  }, [products])

  // Searching jumps straight to results — the hero banner is promotional,
  // not useful once the customer is already looking for something specific.
  const isSearching = search.trim().length > 0

  return (
    <>
      {!isSearching && <HeroCarousel images={(brand?.hero_images ?? []).map((url) => getMediaUrl(url))} />}
      {/* The divider sits right after the hero, so the category chips read
          as part of the products section below it, not the hero above. */}
      <div className="border-t border-border">
        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
        <main className="w-80/100 mx-auto px-0 py-10 sm:px-0 lg:px-0">
          {isLoading && (
            <p className="py-16 text-center text-sm text-muted-foreground">Cargando productos...</p>
          )}
          {isError && (
            <p className="py-16 text-center text-sm text-destructive">
              No pudimos cargar el catálogo. Probá de nuevo en un momento.
            </p>
          )}
          {products && filteredProducts.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Mostrando {shownProducts.length} de {filteredProducts.length}
              </p>
              <SortSelect value={sort} onChange={setSort} />
            </div>
          )}
          {products && <ProductGrid products={shownProducts} />}
          {shownProducts.length < filteredProducts.length && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() =>
                  setVisibleState({ filterKey, count: visibleCount + PAGE_SIZE })
                }
                className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium hover:bg-accent"
              >
                Ver más productos
              </button>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
