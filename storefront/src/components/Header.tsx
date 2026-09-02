import { ShoppingCart } from 'lucide-react'
import type { BrandSettings } from '@/api/brandSettings'
import { useCartStore } from '@/stores/cartStore'

interface Props {
  brand: BrandSettings | undefined
  onOpenCart: () => void
}

export function Header({ brand, onOpenCart }: Props) {
  const itemCount = useCartStore((state) => state.lines.reduce((sum, line) => sum + line.quantity, 0))

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
        {brand?.logo_url && (
          <img
            src={brand.logo_url}
            alt=""
            className="size-10 shrink-0 rounded-md object-contain"
            onError={(event) => {
              event.currentTarget.style.visibility = 'hidden'
            }}
          />
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {brand?.company_name ?? 'Catálogo'}
        </h1>
        <button
          onClick={onOpenCart}
          aria-label="Ver carrito"
          className="relative shrink-0 rounded-full p-2 hover:bg-accent"
        >
          <ShoppingCart className="size-6" />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {itemCount > 9 ? '9+' : itemCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
