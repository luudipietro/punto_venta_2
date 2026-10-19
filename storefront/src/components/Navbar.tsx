import { Moon, Search, ShoppingCart, Sun } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { BrandSettings } from '@/api/brandSettings'
import { useCartStore } from '@/stores/cartStore'
import { useCartUiStore } from '@/stores/cartUiStore'
import { useTheme } from '@/theme/ThemeProvider'
import { getMediaUrl } from '@/api/client'
import { SOCIAL_NETWORKS } from '@/components/SocialIcons'

export function Navbar({ brand }: { brand: BrandSettings | undefined }) {
  const itemCount = useCartStore((state) => state.lines.reduce((sum, line) => sum + line.quantity, 0))
  const openCart = useCartUiStore((state) => state.open)
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  // Search is reachable from any page: on the home page it filters live via
  // the `q` URL param (see HomePage.tsx), from anywhere else it navigates
  // back to `/` with that param set.
  function handleSearchChange(value: string) {
    if (location.pathname === '/') {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('q', value)
      else next.delete('q')
      setSearchParams(next, { replace: true })
    } else {
      navigate(value ? `/?q=${encodeURIComponent(value)}` : '/')
    }
  }

  const socialLinks = SOCIAL_NETWORKS.filter(({ key }) => brand?.social_links?.[key])

  const searchValue = location.pathname === '/' ? (searchParams.get('q') ?? '') : ''

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card">
      <div className="flex w-full items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          {brand?.logo_url && (
            <img
              src={getMediaUrl(brand.logo_url)}
              alt=""
              className="size-9 rounded-md object-contain"
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden'
              }}
            />
          )}
          <span className="hidden truncate text-base font-semibold sm:inline">
            {brand?.company_name ?? 'Catálogo'}
          </span>
        </Link>

        <div className="relative mx-auto w-full max-w-md flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchValue}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Buscar productos..."
            className="w-full rounded-lg border border-border bg-background py-2 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {socialLinks.length > 0 && (
          <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
            {socialLinks.map(({ key, label, Icon }) => (
              <a
                key={key}
                href={brand?.social_links?.[key]}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="rounded-full p-2 hover:bg-accent"
              >
                <Icon className="size-5" />
              </a>
            ))}
          </div>
        )}

        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="shrink-0 rounded-full p-2 hover:bg-accent"
        >
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>

        <button
          onClick={openCart}
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
