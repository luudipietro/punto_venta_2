import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  Boxes,
  LogOut,
  Layers,
  Moon,
  Package,
  Palette,
  Receipt,
  Ruler,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  Tag,
  Truck,
  UserCog,
  UserRound,
  Wallet,
} from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { BranchSelector } from '@/components/BranchSelector'
import { brandConfig } from '@/theme/brand.config'
import { useTheme } from '@/theme/ThemeProvider'
import { useAuthStore } from '@/stores/authStore'
import { useBranches } from '@/hooks/useBranches'
import { useBrandSettings } from '@/hooks/useBrandSettings'

const primaryNav = [
  { to: '/venta', label: 'Venta', icon: ShoppingCart },
  { to: '/ventas', label: 'Historial de ventas', icon: Receipt },
  { to: '/productos', label: 'Productos', icon: Package },
  { to: '/stock', label: 'Stock', icon: Boxes },
  { to: '/compras', label: 'Compras', icon: Truck },
  { to: '/promociones', label: 'Promociones', icon: Tag },
  { to: '/cambios', label: 'Cambios y devoluciones', icon: ArrowLeftRight },
  { to: '/catalogo/clientes', label: 'Clientes', icon: UserRound },
]

// Admin-only — Category/Brand/Color/Size can't even be renamed once created
// (see CLAUDE.md), so managing them at all is restricted to admin.
const catalogNav = [
  { to: '/catalogo/categorias', label: 'Categorías', icon: Layers },
  { to: '/catalogo/marcas', label: 'Marcas', icon: Tag },
  { to: '/catalogo/colores', label: 'Colores', icon: Palette },
  { to: '/catalogo/talles', label: 'Talles', icon: Ruler },
  { to: '/catalogo/sucursales', label: 'Sucursales', icon: Store },
  { to: '/catalogo/metodos-pago', label: 'Métodos de pago', icon: Wallet },
  { to: '/catalogo/usuarios', label: 'Usuarios', icon: UserCog },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
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
  const user = useAuthStore((s) => s.user)
  const role = user?.role
  const activeBranchId = useAuthStore((s) => s.activeBranchId)
  const setActiveBranch = useAuthStore((s) => s.setActiveBranch)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const { data: branches } = useBranches()
  const { data: brand } = useBrandSettings()
  const logoUrl = brand?.logo_url ?? brandConfig.logoUrl
  const companyName = brand?.company_name ?? brandConfig.companyName

  // First time an admin logs in, activeBranchId is still null — default to
  // the first branch, same auto-select SalePage.tsx used to do on its own.
  useEffect(() => {
    if (role === 'admin' && activeBranchId === null && branches && branches.length > 0) {
      setActiveBranch(branches[0].id)
    }
  }, [role, activeBranchId, branches, setActiveBranch])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-svh w-full">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src={logoUrl} alt="" className="size-7 text-primary" />
          <span className="font-semibold tracking-tight">{companyName}</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2">
          {primaryNav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          {role === 'admin' && (
            <>
              <div className="mt-4 mb-1 px-3 text-xs font-medium uppercase text-muted-foreground">
                Catálogo
              </div>
              {catalogNav.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </>
          )}
        </nav>

        <div className="flex flex-col gap-1 border-t px-2 py-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2.5" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </Button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-y-auto">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <BranchSelector />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user?.username}</span>
            <Button variant="ghost" size="sm" className="gap-2" onClick={handleLogout}>
              <LogOut className="size-4" />
              Cerrar sesión
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
