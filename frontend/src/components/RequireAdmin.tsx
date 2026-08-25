import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export function RequireAdmin() {
  const role = useAuthStore((s) => s.user?.role)

  if (role !== 'admin') {
    return <Navigate to="/venta" replace />
  }
  return <Outlet />
}
