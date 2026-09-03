import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadProductImage } from '@/api/product'
import { useBrandSettings, useUpdateBrandSettings } from '@/hooks/useBrandSettings'
import { cssColorToHex, fromApiColorSet, toApiColorSet } from '@/lib/color'
import { brandConfig, type BrandColorSet } from '@/theme/brand.config'
import { LogoCropDialog } from '@/modules/settings/LogoCropDialog'

type ColorToken = keyof BrandColorSet

const COLOR_TOKENS: { token: ColorToken; label: string }[] = [
  { token: 'background', label: 'Fondo' },
  { token: 'foreground', label: 'Texto' },
  { token: 'card', label: 'Tarjeta' },
  { token: 'cardForeground', label: 'Texto en tarjeta' },
  { token: 'primary', label: 'Primario' },
  { token: 'primaryForeground', label: 'Texto sobre primario' },
  { token: 'secondary', label: 'Secundario' },
  { token: 'secondaryForeground', label: 'Texto sobre secundario' },
  { token: 'muted', label: 'Atenuado' },
  { token: 'mutedForeground', label: 'Texto atenuado' },
  { token: 'accent', label: 'Acento' },
  { token: 'accentForeground', label: 'Texto sobre acento' },
  { token: 'border', label: 'Bordes' },
  { token: 'ring', label: 'Foco (ring)' },
]

function defaultsAsHex(theme: 'light' | 'dark'): BrandColorSet {
  const defaults = brandConfig.colors[theme]
  const result = {} as BrandColorSet
  for (const { token } of COLOR_TOKENS) {
    result[token] = cssColorToHex(defaults[token])
  }
  return result
}

export function BrandSettingsPage() {
  const { data: settings, isLoading } = useBrandSettings()
  const updateMutation = useUpdateBrandSettings()

  const [companyName, setCompanyName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [heroImages, setHeroImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadingHero, setUploadingHero] = useState(false)
  const [lightColors, setLightColors] = useState<BrandColorSet | null>(null)
  const [darkColors, setDarkColors] = useState<BrandColorSet | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)

  useEffect(() => {
    if (settings) {
      setCompanyName(settings.company_name)
      setLogoUrl(settings.logo_url)
      setWhatsappNumber(settings.whatsapp_number ?? '')
      setHeroImages(settings.hero_images ?? [])
      setLightColors(
        settings.colors?.light ? fromApiColorSet(settings.colors.light) : defaultsAsHex('light'),
      )
      setDarkColors(settings.colors?.dark ? fromApiColorSet(settings.colors.dark) : defaultsAsHex('dark'))
    }
  }, [settings])

  // Selecting a file opens the crop dialog first — a logo that comes in too
  // large/off-center can be trimmed down before it's ever uploaded, instead
  // of the raw file going straight to /uploads/images.
  function handleFile(file: File | undefined) {
    if (!file) return
    setCropFile(file)
  }

  // Reuses the same generic /uploads/images endpoint ProductsPage.tsx uses
  // for cover photos — there's nothing product-specific about it.
  async function handleCropConfirm(croppedFile: File) {
    setCropFile(null)
    setUploading(true)
    try {
      const url = await uploadProductImage(croppedFile)
      setLogoUrl(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  // No crop step here (unlike the logo) — hero banners are wide/arbitrary
  // aspect ratio by nature, a fixed crop target would fight against that.
  async function handleHeroImageFile(file: File | undefined) {
    if (!file) return
    setUploadingHero(true)
    try {
      const url = await uploadProductImage(file)
      setHeroImages((prev) => [...prev, url])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la imagen')
    } finally {
      setUploadingHero(false)
    }
  }

  function moveHeroImage(index: number, direction: -1 | 1) {
    setHeroImages((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function removeHeroImage(index: number) {
    setHeroImages((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!lightColors || !darkColors) return
    try {
      await updateMutation.mutateAsync({
        company_name: companyName,
        logo_url: logoUrl,
        colors: { light: toApiColorSet(lightColors), dark: toApiColorSet(darkColors) },
        whatsapp_number: whatsappNumber.trim() || null,
        hero_images: heroImages,
      })
      toast.success('Configuración guardada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  if (isLoading || !lightColors || !darkColors) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>
  }

  return (
    <div>
      <PageHeader title="Configuración" description="Logo, nombre de la empresa y colores" />
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
                onChange={(event) => {
                  handleFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="whatsapp-number">Número de WhatsApp para pedidos</Label>
            <Input
              id="whatsapp-number"
              type="tel"
              placeholder="5491122334455"
              value={whatsappNumber}
              onChange={(event) => setWhatsappNumber(event.target.value.replace(/[^0-9]/g, ''))}
            />
            <p className="text-xs text-muted-foreground">
              Solo números, con código de país y sin el "+" (ej: 5491122334455). Se usa en el
              catálogo online para el botón "Pedir por WhatsApp".
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 max-w-md">
        <CardContent className="grid gap-3">
          <div>
            <Label>Imágenes del carrusel (home del catálogo online)</Label>
            <p className="text-xs text-muted-foreground">
              Se muestran en orden, cambiando automáticamente cada 5 segundos.
            </p>
          </div>
          {heroImages.length > 0 && (
            <ul className="grid gap-2">
              {heroImages.map((url, index) => (
                <li key={url} className="flex items-center gap-2 rounded-md border p-2">
                  <img
                    src={url}
                    alt=""
                    className="h-12 w-20 shrink-0 rounded object-cover"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                  <span className="flex-1 truncate text-xs text-muted-foreground">{url}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    onClick={() => moveHeroImage(index, -1)}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={index === heroImages.length - 1}
                    onClick={() => moveHeroImage(index, 1)}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeHeroImage(index)}>
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Input
            type="file"
            accept="image/*"
            disabled={uploadingHero}
            onChange={(event) => {
              handleHeroImageFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          {uploadingHero && <p className="text-xs text-muted-foreground">Subiendo imagen...</p>}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ColorEditor
          title="Colores (modo claro)"
          colors={lightColors}
          onChange={setLightColors}
          onReset={() => setLightColors(defaultsAsHex('light'))}
        />
        <ColorEditor
          title="Colores (modo oscuro)"
          colors={darkColors}
          onChange={setDarkColors}
          onReset={() => setDarkColors(defaultsAsHex('dark'))}
        />
      </div>

      <Button
        onClick={handleSave}
        disabled={updateMutation.isPending || uploading || uploadingHero || !companyName.trim()}
        className="mt-4 w-fit"
      >
        Guardar
      </Button>

      <LogoCropDialog
        file={cropFile}
        open={cropFile !== null}
        onCancel={() => setCropFile(null)}
        onConfirm={handleCropConfirm}
      />
    </div>
  )
}

function ColorEditor({
  title,
  colors,
  onChange,
  onReset,
}: {
  title: string
  colors: BrandColorSet
  onChange: (colors: BrandColorSet) => void
  onReset: () => void
}) {
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{title}</p>
          <Button variant="ghost" size="sm" onClick={onReset}>
            Restablecer
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {COLOR_TOKENS.map(({ token, label }) => (
            <div key={token} className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <input
                type="color"
                value={colors[token]}
                onChange={(event) => onChange({ ...colors, [token]: event.target.value })}
                className="size-7 shrink-0 cursor-pointer rounded border"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
