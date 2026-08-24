import { NavLink, Outlet } from 'react-router-dom'
import {
  ArrowLeftRight,
  Boxes,
  Layers,
  Moon,
  Package,
  Palette,
  Receipt,
  Ruler,
  ShoppingCart,
  Store,
  Sun,
  Tag,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { brandConfig } from '@/theme/brand.config'
import { useTheme } from '@/theme/ThemeProvider'

const primaryNav = [
  { to: '/venta', label: 'Venta', icon: ShoppingCart },
  { to: '/ventas', label: 'Historial de ventas', icon: Receipt },
  { to: '/productos', label: 'Productos', icon: Package },
  { to: '/stock', label: 'Stock', icon: Boxes },
  { to: '/compras', label: 'Compras', icon: Truck },
  { to: '/promociones', label: 'Promociones', icon: Tag },
  { to: '/cambios', label: 'Cambios y devoluciones', icon: ArrowLeftRight },
]

const catalogNav = [
  { to: '/catalogo/categorias', label: 'Categorías', icon: Layers },
  { to: '/catalogo/marcas', label: 'Marcas', icon: Tag },
  { to: '/catalogo/colores', label: 'Colores', icon: Palette },
  { to: '/catalogo/talles', label: 'Talles', icon: Ruler },
  { to: '/catalogo/sucursales', label: 'Sucursales', icon: Store },
  { to: '/catalogo/metodos-pago', label: 'Métodos de pago', icon: Wallet },
  { to: '/catalogo/clientes', label: 'Clientes', icon: UserRound },
]

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof ShoppingCart }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </NavLink>
  )
}

export function Layout() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex h-svh w-full">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src={brandConfig.logoUrl} alt="" className="size-7 text-primary" />
          <span className="font-semibold tracking-tight">{brandConfig.companyName}</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2">
          {primaryNav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          <div className="mt-4 mb-1 px-3 text-xs font-medium uppercase text-muted-foreground">
            Catálogo
          </div>
          {catalogNav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        <div className="border-t px-2 py-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2.5" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
