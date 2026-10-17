import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLogin } from '@/hooks/useAuth'
import { useBrandSettings } from '@/hooks/useBrandSettings'
import { brandConfig } from '@/theme/brand.config'
import { useAuthStore } from '@/stores/authStore'
import { getMediaUrl } from '@/lib/media'

export function LoginPage() {
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()
  const location = useLocation()
  const loginMutation = useLogin()
  const { data: brand } = useBrandSettings()
  const logoUrl = brand?.logo_url ?? brandConfig.logoUrl
  const companyName = brand?.company_name ?? brandConfig.companyName

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  if (token) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? '/venta'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    try {
      await loginMutation.mutateAsync({ username, password })
      const from = (location.state as { from?: Location })?.from?.pathname ?? '/venta'
      navigate(from, { replace: true })
    } catch {
      // error shown below via loginMutation.error
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src={getMediaUrl(logoUrl)} alt="" className="size-10 mx-auto" />
          <CardTitle className="text-lg">{companyName}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {loginMutation.isError && (
              <p className="text-sm text-destructive">
                {loginMutation.error instanceof Error
                  ? loginMutation.error.message
                  : 'Ocurrió un error'}
              </p>
            )}
            <Button type="submit" disabled={loginMutation.isPending || !username || !password}>
              Ingresar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
