import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { StorefrontProduct } from '@/api/storefront'
import { formatPriceOrConsult } from '@/lib/format'
import { getMediaUrl, getPosterUrl, isVideoUrl } from '@/api/client'
import { VideoPlayer } from '@/components/VideoPlayer'
import { useCartStore } from '@/stores/cartStore'
import { useCartUiStore } from '@/stores/cartUiStore'

export function ProductCard({ product }: { product: StorefrontProduct }) {
  const navigate = useNavigate()
  const addLine = useCartStore((state) => state.addLine)
  const openCart = useCartUiStore((state) => state.open)
  const [watchingVideo, setWatchingVideo] = useState(false)

  const productPath = `/producto/${product.id}`
  const gallery = product.gallery_urls.map((url) => getMediaUrl(url))
  const videoUrl = gallery.find(isVideoUrl)
  // A product with a video but no cover shows a gallery photo or, failing
  // that, the video's own poster.
  const picture =
    getMediaUrl(product.image_url) ||
    (videoUrl ? (gallery.find((url) => !isVideoUrl(url)) ?? getPosterUrl(videoUrl)) : '')

  // A product with a single (or no) variant goes straight into the cart; with
  // several, the customer has to choose one, so we send them to its page.
  function handleQuickAdd() {
    if (product.variants.length > 1) {
      navigate(productPath)
      return
    }
    const variant = product.variants[0]
    addLine(
      {
        key: `${product.id}:${variant?.stock_id ?? 'none'}`,
        productId: product.id,
        productName: product.name,
        imageUrl: picture,
        price: product.price,
        variantLabel: variant
          ? [variant.color_name, variant.size_label].filter(Boolean).join(' / ') || null
          : null,
      },
      1,
    )
    openCart()
  }

  // The picture and the text are separate links (not one around the whole
  // card), so tapping a video's controls never navigates away.
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left text-card-foreground shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {videoUrl ? (
          <>
            <VideoPlayer
              src={videoUrl}
              poster={picture}
              active
              smallButton
              label={`Video de ${product.name}`}
              onStartedChange={setWatchingVideo}
            />
            {!watchingVideo && (
              <Link to={productPath} tabIndex={-1} aria-hidden="true" className="absolute inset-0" />
            )}
          </>
        ) : (
          <Link to={productPath} tabIndex={-1} aria-hidden="true" className="block size-full">
            {picture ? (
              <img
                src={picture}
                alt=""
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
          </Link>
        )}
        {product.in_stock && (
          <button
            type="button"
            onClick={handleQuickAdd}
            aria-label={`Agregar ${product.name} al carrito`}
            // Moves out of the way of the video controls while one is playing.
            className={`absolute right-2 z-10 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-110 ${
              watchingVideo ? 'top-2' : 'bottom-2'
            }`}
          >
            <Plus className="size-5" />
          </button>
        )}
      </div>
      <Link to={productPath} className="flex flex-1 flex-col gap-1 p-3">
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
      </Link>
    </article>
  )
}
