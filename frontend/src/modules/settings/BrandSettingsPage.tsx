import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadProductImage } from '@/api/product'
import { useBrandSettings, useUpdateBrandSettings } from '@/hooks/useBrandSettings'

export function BrandSettingsPage() {
  const { data: settings, isLoading } = useBrandSettings()
  const updateMutation = useUpdateBrandSettings()

  const [companyName, setCompanyName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (settings) {
      setCompanyName(settings.company_name)
      setLogoUrl(settings.logo_url)
    }
  }, [settings])

  // Reuses the same generic /uploads/images endpoint ProductsPage.tsx uses
  // for cover photos — there's nothing product-specific about it.
  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadProductImage(file)
      setLogoUrl(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({ company_name: companyName, logo_url: logoUrl })
      toast.success('Configuración guardada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>
  }

  return (
    <div>
      <PageHeader title="Configuración" description="Logo y nombre de la empresa" />
      <Card className="max-w-md">
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="company-name">Nombre de la empresa</Label>
            <Input
              id="company-name"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  className="size-12 rounded-md border object-contain p-1"
                  onError={(event) => {
                    event.currentTarget.style.visibility = 'hidden'
                  }}
                />
              )}
              <Input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || uploading || !companyName.trim()}
            className="w-fit"
          >
            Guardar
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
