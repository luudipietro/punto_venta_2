import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useProducts } from '@/hooks/useProducts'
import { useBrandSettings } from '@/hooks/useBrandSettings'
import { formatCurrency } from '@/lib/format'
import { downloadPriceTagsPdf, SHEET_LAYOUTS, type PriceTagItem } from '@/lib/priceTags'
import { brandConfig } from '@/theme/brand.config'

interface Selection {
  copies: number
  detail: string
}

export function PriceTagsPage() {
  const { data: products, isLoading } = useProducts()
  const { data: brand } = useBrandSettings()
  const companyName = brand?.company_name ?? brandConfig.companyName
  const logoUrl = brand?.logo_url ?? brandConfig.logoUrl

  const [search, setSearch] = useState('')
  const [layoutKey, setLayoutKey] = useState(SHEET_LAYOUTS[2].key)
  const [selections, setSelections] = useState<Record<number, Selection>>({})
  const [generating, setGenerating] = useState(false)

  const layout = SHEET_LAYOUTS.find((option) => option.key === layoutKey) ?? SHEET_LAYOUTS[0]

  const filtered = (products ?? []).filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase()),
  )

  function updateSelection(productId: number, patch: Partial<Selection>) {
    setSelections((prev) => {
      const existing: Selection = prev[productId] ?? { copies: 0, detail: '' }
      return { ...prev, [productId]: { ...existing, ...patch } }
    })
  }

  const selectedItems = useMemo<PriceTagItem[]>(() => {
    if (!products) return []
    return Object.entries(selections)
      .filter(([, selection]) => selection.copies > 0)
      .map(([productId, selection]) => {
        const product = products.find((p) => p.id === Number(productId))
        return {
          name: product?.name ?? `Producto #${productId}`,
          price: product?.price ?? 0,
          detail: selection.detail || undefined,
          copies: selection.copies,
        }
      })
  }, [selections, products])

  const totalTags = selectedItems.reduce((sum, item) => sum + item.copies, 0)
  const perSheet = layout.rows * layout.cols
  const totalSheets = totalTags > 0 ? Math.ceil(totalTags / perSheet) : 0

  async function handleGenerate() {
    setGenerating(true)
    try {
      await downloadPriceTagsPdf({ companyName, logoUrl, layout, items: selectedItems })
      toast.success('PDF de carteles generado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar el PDF')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Carteles de precio"
        description="Elegí productos ya cargados, cuántos carteles de cada uno, y el tamaño de hoja."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid min-w-48 flex-1 gap-1.5">
          <Label htmlFor="pricetag-search">Buscar producto</Label>
          <Input
            id="pricetag-search"
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Tamaño de hoja</Label>
          <Select value={layoutKey} onValueChange={setLayoutKey}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHEET_LAYOUTS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando productos...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead className="w-28">Cantidad</TableHead>
              <TableHead>Detalle (opcional)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map((product) => {
                const selection = selections[product.id] ?? { copies: 0, detail: '' }
                return (
                  <TableRow key={product.id}>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>{formatCurrency(product.price)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={selection.copies || ''}
                        placeholder="0"
                        onChange={(event) =>
                          updateSelection(product.id, { copies: Number(event.target.value) || 0 })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Ej: Talles S a XL"
                        value={selection.detail}
                        onChange={(event) => updateSelection(product.id, { detail: event.target.value })}
                      />
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin productos
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          {totalTags} cartel{totalTags === 1 ? '' : 'es'} — {totalSheets} hoja{totalSheets === 1 ? '' : 's'} A4
        </p>
        <Button disabled={totalTags === 0 || generating} onClick={handleGenerate}>
          {generating ? 'Generando...' : 'Generar PDF'}
        </Button>
      </Card>
    </div>
  )
}
