import { Outlet } from 'react-router-dom'
import { BrandMetaSync } from '@/components/BrandMetaSync'
import { Navbar } from '@/components/Navbar'
import { CartSidebar } from '@/components/CartSidebar'
import { useBrandSettings } from '@/hooks/useBrandSettings'
import { ThemeProvider } from '@/theme/ThemeProvider'

/** Shared chrome for every route — the navbar and cart sidebar stay mounted
 * across navigation (`<Outlet/>` swaps only the page content), so the cart
 * remains reachable from the product page too. */
export function Layout() {
  const { data: brand } = useBrandSettings()

  return (
    <ThemeProvider colors={brand?.colors}>
      <div className="min-h-screen bg-background text-foreground">
        <BrandMetaSync brand={brand} />
        <Navbar brand={brand} />
        <Outlet />
        <CartSidebar whatsappNumber={brand?.whatsapp_number ?? null} />
      </div>
    </ThemeProvider>
  )
}
