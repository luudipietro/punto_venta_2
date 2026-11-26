import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Minus, Play, Plus, ShoppingCart } from 'lucide-react'
import type { StorefrontVariant } from '@/api/storefront'
import { useStorefrontProducts } from '@/hooks/useStorefrontProducts'
import { formatPriceOrConsult } from '@/lib/format'
import { useCartStore } from '@/stores/cartStore'
import { useCartUiStore } from '@/stores/cartUiStore'
import { getMediaUrl, getPosterUrl, isVideoUrl } from '@/api/client'
import { ImageViewer } from '@/components/ImageViewer'

/** `null` when the variant carries no color/size info at all (a product
 * with a single, plain stock row) — nothing worth showing on a cart line. */
function variantLabel(variant: StorefrontVariant): string | null {
  return [variant.color_name, variant.size_label].filter(Boolean).join(' / ') || null
}

export function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const { data: products, isLoading } = useStorefrontProducts()
  const addLine = useCartStore((state) => state.addLine)
  const openCart = useCartUiStore((state) => state.open)

  const navigate = useNavigate()
  const product = products?.find((p) => p.id === Number(id))

  const [selectedVariant, setSelectedVariant] = useState<StorefrontVariant | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [imageIndex, setImageIndex] = useState(0)

  // Cover first, then the extra gallery photos and videos; deduped in case the
  // cover is also in the gallery.
  const gallery = useMemo(() => {
    if (!product) return []
    const urls = [product.image_url, ...product.gallery_urls].map((url) => getMediaUrl(url))
    return Array.from(new Set(urls.filter(Boolean)))
  }, [product])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  useEffect(() => {
    if (!product) return
    setSelectedVariant(product.variants[0] ?? null)
    setQuantity(1)
    setImageIndex(0)
  }, [product])

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Cargando...</p>
  }

  if (!product) {
    return (
      <div className="w-full px-20 py-16 text-center sm:px-20 lg:px-20">
        <p className="mb-4 text-sm text-muted-foreground">No encontramos ese producto.</p>
        <Link to="/" className="text-sm font-medium text-primary underline">
          Volver al catálogo
        </Link>
      </div>
    )
  }

  // Back to wherever the customer came from (keeps the catalog's filters,
  // sort and scroll position); a direct deep link falls back to "/".
  function goBack() {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/')
  }
  const hasVariantChoice = product.variants.length > 1
  const hasVariants = product.variants.length > 0
  const canAdd = product.in_stock && (!hasVariants || selectedVariant !== null)
  const maxQuantity = selectedVariant?.quantity

  function handleAddToCart() {
    if (!product || !canAdd) return
    // The cart shows a picture: the first photo, or else a video's poster.
    const cartImage =
      gallery.find((url) => !isVideoUrl(url)) ?? (gallery[0] ? getPosterUrl(gallery[0]) : '')
    addLine(
      {
        key: `${product.id}:${selectedVariant?.stock_id ?? 'none'}`,
        productId: product.id,
        productName: product.name,
        imageUrl: cartImage,
        price: product.price,
        variantLabel: selectedVariant ? variantLabel(selectedVariant) : null,
      },
      quantity,
    )
    openCart()
  }

  return (
    // Same side padding on phones as the home grid, shared by everything on the
    // page.
    <div className="mx-auto w-full px-3 py-6 sm:px-6 lg:px-20">
      <button
        onClick={goBack}
        className="mb-4 inline-flex items-center gap-1 text-xl text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Volver al catálogo
      </button>

      <div className="grid grid-cols-1 gap-8 pt-10 md:grid-cols-2">
        <div className="min-w-0">
          <div className="mx-auto aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted md:w-80/100">
            <ImageViewer
              images={gallery}
              index={Math.min(imageIndex, Math.max(gallery.length - 1, 0))}
              onIndexChange={setImageIndex}
              alt={product.name}
            />
          </div>
          {gallery.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {gallery.map((url, i) => (
                <button
                  key={url}
                  onClick={() => setImageIndex(i)}
                  aria-label={`Ver ${isVideoUrl(url) ? 'video' : 'foto'} ${i + 1}`}
                  className={`relative size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                    imageIndex === i ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  <img
                    src={isVideoUrl(url) ? getPosterUrl(url) : url}
                    alt=""
                    className="size-full object-cover"
                  />
                  {isVideoUrl(url) && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-full bg-black/60 p-1.5 text-white">
                        <Play className="size-3 fill-current" />
                      </span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          {product.category_name && (
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {product.category_name}
            </p>
          )}
          <h1 className="mb-2 text-2xl font-bold">{product.name}</h1>
          <p className="mb-4 text-2xl font-bold text-primary">{formatPriceOrConsult(product.price)}</p>

          {product.description && (
            <p className="mb-6 text-sm whitespace-pre-wrap text-muted-foreground">
              {product.description}
            </p>
          )}

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
                  onClick={() =>
                    setQuantity((q) => (maxQuantity ? Math.min(maxQuantity, q + 1) : q + 1))
                  }
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 md:max-w-xs"
          >
            <ShoppingCart className="size-5" />
            {product.in_stock ? 'Agregar al carrito' : 'Sin stock'}
          </button>
        </div>
      </div>
    </div>
  )
}
