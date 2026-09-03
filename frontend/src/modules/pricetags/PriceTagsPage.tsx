import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useProducts } from '@/hooks/useProducts'
import { useBrandSettings } from '@/hooks/useBrandSettings'
import { usePromotions } from '@/hooks/usePromotions'
import { promotionApi, type PromotionItemRead } from '@/api/promotion'
import { formatCurrency } from '@/lib/format'
import { generateLineKey } from '@/lib/id'
import { downloadPriceTagsPdf, SHEET_LAYOUTS, type PriceTagItem } from '@/lib/priceTags'
import { brandConfig } from '@/theme/brand.config'

interface Selection {
  copies: number
  detail: string
  promoItemId: number | null
}

/** A cartel that isn't backed by a catalog Product — free-text name/price,
 * for a one-off item (a display sample, a bundle, something not worth
 * loading as a real Product just to print a tag for it). */
interface ManualItem {
  id: string
  name: string
  price: number
  copies: number
  detail: string
}

function emptyManualDraft(): { name: string; price: string } {
  return { name: '', price: '' }
}

interface PromoCandidate {
  promotionName: string
  item: PromotionItemRead
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function applyDiscount(price: number, item: PromotionItemRead): number {
  const discounted =
    item.discount_type === 'percentage' ? price * (1 - item.discount_value / 100) : price - item.discount_value
  return Math.max(0, Math.round(discounted * 100) / 100)
}

export function PriceTagsPage() {
  const { data: products, isLoading } = useProducts()
  const { data: brand } = useBrandSettings()
  const { data: promotions } = usePromotions()
  const companyName = brand?.company_name ?? brandConfig.companyName
  const logoUrl = brand?.logo_url ?? brandConfig.logoUrl
  const primaryColor = brand?.colors?.light?.primary ?? brandConfig.colors.light.primary

  const today = todayIso()
  const activePromotionIds = useMemo(
    () =>
      (promotions ?? [])
        .filter((p) => p.active && p.start_date <= today && (!p.end_date || p.end_date >= today))
        .map((p) => p.id),
    [promotions, today],
  )

  // Promotion list/detail endpoints follow the same split as usePromotions —
  // list() doesn't include items, so matching a promo to a product needs
  // each active promotion's detail. useQueries fetches them in parallel and
  // shares the ['promotions', id] cache key with usePromotion(id).
  const promotionDetailQueries = useQueries({
    queries: activePromotionIds.map((id) => ({
      queryKey: ['promotions', id],
      queryFn: () => promotionApi.getById(id),
    })),
  })
  const promotionDetails = promotionDetailQueries.map((q) => q.data).filter((d) => d !== undefined)

  const [search, setSearch] = useState('')
  const [layoutKey, setLayoutKey] = useState(SHEET_LAYOUTS[2].key)
  const [selections, setSelections] = useState<Record<number, Selection>>({})
  const [manualItems, setManualItems] = useState<ManualItem[]>([])
  const [manualDraft, setManualDraft] = useState(emptyManualDraft())
  const [generating, setGenerating] = useState(false)

  function addManualItem() {
    const price = Number(manualDraft.price)
    if (!manualDraft.name.trim() || !price || price <= 0) return
    setManualItems((prev) => [
      ...prev,
      { id: generateLineKey(), name: manualDraft.name.trim(), price, copies: 1, detail: '' },
    ])
    setManualDraft(emptyManualDraft())
  }

  function updateManualItem(id: string, patch: Partial<ManualItem>) {
    setManualItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeManualItem(id: string) {
    setManualItems((prev) => prev.filter((item) => item.id !== id))
  }

  const layout = SHEET_LAYOUTS.find((option) => option.key === layoutKey) ?? SHEET_LAYOUTS[0]

  const filtered = (products ?? []).filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase()),
  )

  function updateSelection(productId: number, patch: Partial<Selection>) {
    setSelections((prev) => {
      const existing: Selection = prev[productId] ?? { copies: 0, detail: '', promoItemId: null }
      return { ...prev, [productId]: { ...existing, ...patch } }
    })
  }

  function candidatesFor(productId: number, categoryId: number | null): PromoCandidate[] {
    const candidates: PromoCandidate[] = []
    for (const promotion of promotionDetails) {
      if (!promotion) continue
      for (const item of promotion.items) {
        if (item.product_id === productId || (categoryId !== null && item.category_id === categoryId)) {
          candidates.push({ promotionName: promotion.name, item })
        }
      }
    }
    return candidates
  }

  const selectedItems = useMemo<PriceTagItem[]>(() => {
    const fromCatalog: PriceTagItem[] = !products
      ? []
      : Object.entries(selections)
          .filter(([, selection]) => selection.copies > 0)
          .map(([productId, selection]) => {
            const product = products.find((p) => p.id === Number(productId))
            const price = product?.price ?? 0
            const candidates = product ? candidatesFor(product.id, product.category_id) : []
            const promoItem = candidates.find((c) => c.item.id === selection.promoItemId)?.item
            return {
              name: product?.name ?? `Producto #${productId}`,
              price: promoItem ? applyDiscount(price, promoItem) : price,
              originalPrice: promoItem ? price : undefined,
              detail: selection.detail || undefined,
              copies: selection.copies,
            }
          })
    const fromManual: PriceTagItem[] = manualItems
      .filter((item) => item.copies > 0)
      .map((item) => ({ name: item.name, price: item.price, detail: item.detail || undefined, copies: item.copies }))
    return [...fromCatalog, ...fromManual]
  }, [selections, products, promotionDetails, manualItems])

  const totalTags = selectedItems.reduce((sum, item) => sum + item.copies, 0)
  const perSheet = layout.rows * layout.cols
  const totalSheets = totalTags > 0 ? Math.ceil(totalTags / perSheet) : 0

  async function handleGenerate() {
    setGenerating(true)
    try {
      await downloadPriceTagsPdf({ companyName, logoUrl, layout, items: selectedItems, primaryColor })
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
              <TableHead>Promoción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map((product) => {
                const selection = selections[product.id] ?? { copies: 0, detail: '', promoItemId: null }
                const candidates = candidatesFor(product.id, product.category_id)
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
                    <TableCell>
                      {candidates.length > 0 ? (
                        <Select
                          value={selection.promoItemId ? String(selection.promoItemId) : 'none'}
                          onValueChange={(value) =>
                            updateSelection(product.id, {
                              promoItemId: value === 'none' ? null : Number(value),
                            })
                          }
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin promoción</SelectItem>
                            {candidates.map((candidate) => (
                              <SelectItem key={candidate.item.id} value={String(candidate.item.id)}>
                                {candidate.promotionName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin productos
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <PageHeader
        title="Carteles manuales"
        description="Para algo que no está cargado como producto — escribí el nombre y el precio a mano."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="manual-name">Nombre</Label>
          <Input
            id="manual-name"
            placeholder="Ej: Muestra vidriera"
            value={manualDraft.name}
            onChange={(event) => setManualDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="manual-price">Precio</Label>
          <Input
            id="manual-price"
            type="number"
            min={0}
            className="w-32"
            placeholder="0"
            value={manualDraft.price}
            onChange={(event) => setManualDraft((prev) => ({ ...prev, price: event.target.value }))}
          />
        </div>
        <Button
          variant="outline"
          disabled={!manualDraft.name.trim() || !Number(manualDraft.price)}
          onClick={addManualItem}
        >
          Agregar cartel
        </Button>
      </div>

      {manualItems.length > 0 && (
        <Table className="mb-4">
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead className="w-28">Cantidad</TableHead>
              <TableHead>Detalle (opcional)</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {manualItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{formatCurrency(item.price)}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    className="w-20"
                    value={item.copies || ''}
                    placeholder="0"
                    onChange={(event) =>
                      updateManualItem(item.id, { copies: Number(event.target.value) || 0 })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    placeholder="Ej: Talles S a XL"
                    value={item.detail}
                    onChange={(event) => updateManualItem(item.id, { detail: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => removeManualItem(item.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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
