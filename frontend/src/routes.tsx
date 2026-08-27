import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { RequireAdmin } from '@/components/RequireAdmin'
import { RequireAuth } from '@/components/RequireAuth'
import { LoginPage } from '@/modules/auth/LoginPage'
import { SalePage } from '@/modules/sale/SalePage'
import { SalesHistoryPage } from '@/modules/sale/SalesHistoryPage'
import { ProductsPage } from '@/modules/products/ProductsPage'
import { StockPage } from '@/modules/stock/StockPage'
import { PurchasesPage } from '@/modules/purchases/PurchasesPage'
import { PromotionsPage } from '@/modules/promotions/PromotionsPage'
import { ExchangesPage } from '@/modules/exchanges/ExchangesPage'
import { CategoriesPage } from '@/modules/catalog/CategoriesPage'
import { BrandsPage } from '@/modules/catalog/BrandsPage'
import { ColorsPage } from '@/modules/catalog/ColorsPage'
import { SizesPage } from '@/modules/catalog/SizesPage'
import { BranchesPage } from '@/modules/catalog/BranchesPage'
import { PaymentMethodsPage } from '@/modules/catalog/PaymentMethodsPage'
import { CustomersPage } from '@/modules/catalog/CustomersPage'
import { UsersPage } from '@/modules/users/UsersPage'
import { BrandSettingsPage } from '@/modules/settings/BrandSettingsPage'
import { AuditLogPage } from '@/modules/admin/AuditLogPage'
import { FinanceDashboardPage } from '@/modules/dashboard/FinanceDashboardPage'
import { PriceTagsPage } from '@/modules/pricetags/PriceTagsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/venta" replace />} />
          <Route path="/venta" element={<SalePage />} />
          <Route path="/ventas" element={<SalesHistoryPage />} />
          <Route path="/productos" element={<ProductsPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/compras" element={<PurchasesPage />} />
          <Route path="/promociones" element={<PromotionsPage />} />
          <Route path="/cambios" element={<ExchangesPage />} />
          <Route path="/catalogo/clientes" element={<CustomersPage />} />
          <Route path="/carteles" element={<PriceTagsPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/catalogo/categorias" element={<CategoriesPage />} />
            <Route path="/catalogo/marcas" element={<BrandsPage />} />
            <Route path="/catalogo/colores" element={<ColorsPage />} />
            <Route path="/catalogo/talles" element={<SizesPage />} />
            <Route path="/catalogo/sucursales" element={<BranchesPage />} />
            <Route path="/catalogo/metodos-pago" element={<PaymentMethodsPage />} />
            <Route path="/catalogo/usuarios" element={<UsersPage />} />
            <Route path="/catalogo/trazabilidad" element={<AuditLogPage />} />
            <Route path="/finanzas" element={<FinanceDashboardPage />} />
            <Route path="/configuracion" element={<BrandSettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/venta" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
