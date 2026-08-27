import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  Boxes,
  History,
  LineChart,
  LogOut,
  Layers,
  Menu,
  Moon,
  Package,
  Palette,
  Receipt,
  Ruler,
  Settings,
  ShoppingCart,
  Sticker,
  Store,
  Sun,
  Tag,
  Truck,
  UserCog,
  UserRound,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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

// Admin-only, kept apart from catalogNav since these aren't catalog CRUD
// screens — traceability and financial analytics over the whole business.
const adminNav = [
  { to: '/finanzas', label: 'Finanzas', icon: LineChart },
  { to: '/catalogo/trazabilidad', label: 'Trazabilidad', icon: History },
  { to: '/carteles', label: 'Carteles de precio', icon: Sticker },
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

function SidebarContent({
  role,
  logoUrl,
  companyName,
  theme,
  toggleTheme,
  onNavigate,
}: {
  role: 'admin' | 'empleado' | undefined
  logoUrl: string
  companyName: string
  theme: 'light' | 'dark'
  toggleTheme: () => void
  onNavigate?: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <img src={logoUrl} alt="" className="size-7 text-primary" />
        <span className="font-semibold tracking-tight">{companyName}</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2" onClick={onNavigate}>
        {primaryNav.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        {role === 'admin' && (
          <>
            <div className="mt-4 mb-1 px-3 text-xs font-medium uppercase text-muted-foreground">
              Administración
            </div>
            {adminNav.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}

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
    </div>
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

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
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-background md:flex">
        <SidebarContent
          role={role}
          logoUrl={logoUrl}
          companyName={companyName}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 md:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Menú</SheetTitle>
          </SheetHeader>
          <SidebarContent
            role={role}
            logoUrl={logoUrl}
            companyName={companyName}
            theme={theme}
            toggleTheme={toggleTheme}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-6 sm:py-3">
          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 md:hidden"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="size-5" />
              <span className="sr-only">Abrir menú</span>
            </Button>
            <div className="min-w-0">
              <BranchSelector />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.username}</span>
            <Button variant="ghost" size="sm" className="gap-2" onClick={handleLogout}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
