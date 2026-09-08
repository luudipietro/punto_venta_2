import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Info, Pencil, Power, PowerOff, Trash2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCategories } from '@/hooks/useCategories'
import { useProducts } from '@/hooks/useProducts'
import {
  useCreatePromotion,
  useDeletePromotion,
  usePromotions,
  useUpdatePromotion,
} from '@/hooks/usePromotions'
import { promotionApi } from '@/api/promotion'
import type { DiscountType, PromotionItemInput, PromotionRead } from '@/api/promotion'
import { generateLineKey } from '@/lib/id'
import { PromotionDetail } from '@/modules/promotions/PromotionDetail'

interface DraftItem extends PromotionItemInput {
  key: string
  targetType: 'product' | 'category'
}

const emptyItem = (): DraftItem => ({
  key: generateLineKey(),
  targetType: 'product',
  product_id: undefined,
  category_id: undefined,
  discount_type: 'percentage',
  discount_value: 0,
  min_quantity: 1,
  max_quantity: undefined,
})

export function PromotionsPage() {
  const { data: promotions, isLoading } = usePromotions()
  const { data: products } = useProducts()
  const { data: categories } = useCategories()

  const createMutation = useCreatePromotion()
  const updateMutation = useUpdatePromotion()
  const removeMutation = useDeletePromotion()

  const [open, setOpen] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [active, setActive] = useState(true)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [targetPriceMode, setTargetPriceMode] = useState(false)
  const [targetPrice, setTargetPrice] = useState(0)
  const [distribution, setDistribution] = useState<'percentage' | 'equal'>('percentage')

  const allProductLines = items.length > 0 && items.every((item) => item.targetType === 'product')

  function openCreateDialog() {
    setEditingId(null)
    setName('')
    setStartDate(new Date().toISOString().slice(0, 10))
    setEndDate('')
    setItems([emptyItem()])
    setActive(true)
    setTargetPriceMode(false)
    setTargetPrice(0)
    setDistribution('percentage')
    setOpen(true)
  }

  async function openEditDialog(id: number) {
    const promotion = await promotionApi.getById(id)
    setEditingId(promotion.id)
    setName(promotion.name)
    setStartDate(promotion.start_date)
    setEndDate(promotion.end_date ?? '')
    setItems(
      promotion.items.map((item) => ({
        key: generateLineKey(),
        targetType: item.product_id !== null ? 'product' : 'category',
        product_id: item.product_id ?? undefined,
        category_id: item.category_id ?? undefined,
        discount_type: item.discount_type,
        discount_value: item.discount_value,
        min_quantity: item.min_quantity,
        max_quantity: item.max_quantity ?? undefined,
      })),
    )
    setActive(promotion.active)
    setTargetPriceMode(false)
    setTargetPrice(0)
    setDistribution('percentage')
    setOpen(true)
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key))
  }

  // Recomputes each line's discount_type/discount_value from a single
  // "final combo price" whenever that mode is on. Deliberately excludes
  // discount_type/discount_value from the dependency fingerprint below
  // (only product_id/min_quantity) so writing the computed values back via
  // setItems doesn't re-trigger itself in a loop.
  const itemsFingerprint = items.map((item) => `${item.product_id}:${item.min_quantity}`).join(',')
  useEffect(() => {
    if (!targetPriceMode || !allProductLines || items.length === 0) return
    const lineOriginals = items.map((item) => {
      const product = products?.find((p) => p.id === item.product_id)
      return (product?.price ?? 0) * (item.min_quantity || 1)
    })
    const totalOriginal = lineOriginals.reduce((sum, value) => sum + value, 0)
    if (totalOriginal <= 0) return
    const totalDiscount = totalOriginal - targetPrice

    // Always store target-price-mode lines as fixed_amount, never
    // percentage: a fixed dollar amount reproduces exactly through the
    // backend's compute_line_discount (no re-quantization against a % at
    // sale time), and "distribute the total discount + last line absorbs
    // the rounding remainder" is what guarantees the lines sum back to
    // exactly totalDiscount instead of drifting by a cent or two.
    const weights = distribution === 'percentage' ? lineOriginals : lineOriginals.map(() => 1)
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    const raw = weights.map((weight) => (totalWeight > 0 ? (totalDiscount * weight) / totalWeight : 0))
    const rounded = raw.map((value) => Math.round(value * 100) / 100)
    const roundedSum = rounded.slice(0, -1).reduce((sum, value) => sum + value, 0)
    const lastValue = Math.round((totalDiscount - roundedSum) * 100) / 100
    const dollarDiscounts = rounded.map((value, index) =>
      index === rounded.length - 1 ? lastValue : value,
    )

    setItems((prev) =>
      prev.map((item, index) => ({
        ...item,
        discount_type: 'fixed_amount',
        discount_value: dollarDiscounts[index] ?? 0,
      })),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPriceMode, targetPrice, distribution, allProductLines, itemsFingerprint, products])

  const canSubmit =
    name.trim() !== '' &&
    startDate !== '' &&
    items.length > 0 &&
    items.every((item) => (item.targetType === 'product' ? item.product_id : item.category_id))

  async function handleSubmit() {
    const payload = {
      name,
      start_date: startDate,
      end_date: endDate || null,
      active,
      items: items.map((item) => ({
        product_id: item.targetType === 'product' ? item.product_id : null,
        category_id: item.targetType === 'category' ? item.category_id : null,
        discount_type: item.discount_type,
        discount_value: item.discount_value,
        min_quantity: item.min_quantity,
        max_quantity: item.max_quantity || undefined,
      })),
    }
    try {
      if (editingId === null) {
        await createMutation.mutateAsync(payload)
        toast.success('Promoción creada')
      } else {
        await updateMutation.mutateAsync({ id: editingId, payload })
        toast.success('Promoción actualizada')
      }
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  // Toggles active without opening the full edit dialog — refetches the
  // promotion's own items first since PUT replaces them wholesale (same
  // shape as openEditDialog/handleSubmit) and only flips `active`.
  async function handleToggleActive(promotion: PromotionRead) {
    setTogglingId(promotion.id)
    try {
      const detail = await promotionApi.getById(promotion.id)
      await updateMutation.mutateAsync({
        id: promotion.id,
        payload: {
          name: detail.name,
          start_date: detail.start_date,
          end_date: detail.end_date,
          active: !detail.active,
          items: detail.items.map((item) => ({
            product_id: item.product_id,
            category_id: item.category_id,
            discount_type: item.discount_type,
            discount_value: item.discount_value,
            min_quantity: item.min_quantity,
            max_quantity: item.max_quantity ?? undefined,
          })),
        },
      })
      toast.success(detail.active ? 'Promoción desactivada' : 'Promoción activada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta promoción?')) return
    try {
      await removeMutation.mutateAsync(id)
      toast.success('Promoción eliminada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Promociones"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>Nueva</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingId === null ? 'Nueva promoción' : 'Editar promoción'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="promo-name">Nombre</Label>
                  <Input id="promo-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="start-date">Desde</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="end-date">Hasta</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Dejar vacío para sin fecha límite</p>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => setActive(event.target.checked)}
                  />
                  Activa
                </label>

                <div className="grid gap-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={targetPriceMode}
                      disabled={!allProductLines}
                      onChange={(event) => setTargetPriceMode(event.target.checked)}
                    />
                    Definir por precio final del combo
                  </label>
                  {!allProductLines && (
                    <p className="text-xs text-muted-foreground">
                      Solo disponible cuando todas las líneas apuntan a un producto puntual (no a
                      categoría).
                    </p>
                  )}
                  {targetPriceMode && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor="target-price">Precio final del combo</Label>
                        <Input
                          id="target-price"
                          type="number"
                          min={0}
                          value={targetPrice || ''}
                          onChange={(event) => setTargetPrice(Number(event.target.value) || 0)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Reparto del descuento</Label>
                        <Select
                          value={distribution}
                          onValueChange={(value) => setDistribution(value as 'percentage' | 'equal')}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">Porcentual (proporcional al precio)</SelectItem>
                            <SelectItem value="equal">Partes iguales entre las prendas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  {items.map((item) => (
                    <div key={item.key} className="grid gap-2 rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={item.targetType}
                          onValueChange={(value) =>
                            updateItem(item.key, { targetType: value as 'product' | 'category' })
                          }
                        >
                          <SelectTrigger className="w-full sm:w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="product">Producto</SelectItem>
                            <SelectItem value="category">Categoría</SelectItem>
                          </SelectContent>
                        </Select>
                        {item.targetType === 'product' ? (
                          <Select
                            value={item.product_id ? String(item.product_id) : undefined}
                            onValueChange={(value) => updateItem(item.key, { product_id: Number(value) })}
                          >
                            <SelectTrigger className="min-w-0 flex-1">
                              <SelectValue placeholder="Elegir producto" />
                            </SelectTrigger>
                            <SelectContent>
                              {products?.map((product) => (
                                <SelectItem key={product.id} value={String(product.id)}>
                                  {product.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select
                            value={item.category_id ? String(item.category_id) : undefined}
                            onValueChange={(value) => updateItem(item.key, { category_id: Number(value) })}
                          >
                            <SelectTrigger className="min-w-0 flex-1">
                              <SelectValue placeholder="Elegir categoría" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories?.map((category) => (
                                <SelectItem key={category.id} value={String(category.id)}>
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => removeItem(item.key)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Select
                          value={item.discount_type}
                          disabled={targetPriceMode}
                          onValueChange={(value) =>
                            updateItem(item.key, { discount_type: value as DiscountType })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">% Porcentaje</SelectItem>
                            <SelectItem value="fixed_amount">$ Fijo</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={0}
                          placeholder="Valor"
                          disabled={targetPriceMode}
                          value={item.discount_value || ''}
                          onChange={(event) =>
                            updateItem(item.key, { discount_value: Number(event.target.value) || 0 })
                          }
                        />
                        <Input
                          type="number"
                          min={1}
                          placeholder="Cant. mínima"
                          value={item.min_quantity || ''}
                          onChange={(event) =>
                            updateItem(item.key, { min_quantity: Number(event.target.value) || 1 })
                          }
                        />
                        <Input
                          type="number"
                          min={1}
                          placeholder="Tope (opcional)"
                          value={item.max_quantity || ''}
                          onChange={(event) =>
                            updateItem(item.key, {
                              max_quantity: event.target.value ? Number(event.target.value) : undefined,
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={addItem}>
                    <Plus className="size-3.5" />
                    Agregar línea
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
                >
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotions?.length ? (
              promotions.map((promotion) => (
                <TableRow key={promotion.id}>
                  <TableCell>{promotion.name}</TableCell>
                  <TableCell>
                    {promotion.start_date} — {promotion.end_date ?? 'Sin fecha límite'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={promotion.active ? 'default' : 'secondary'}>
                      {promotion.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setDetailId(promotion.id)}>
                      <Info className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={promotion.active ? 'Desactivar' : 'Activar'}
                      disabled={togglingId === promotion.id}
                      onClick={() => handleToggleActive(promotion)}
                    >
                      {promotion.active ? (
                        <PowerOff className="size-4" />
                      ) : (
                        <Power className="size-4" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(promotion.id)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(promotion.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin promociones
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={detailId !== null} onOpenChange={(isOpen) => !isOpen && setDetailId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle de la promoción</DialogTitle>
          </DialogHeader>
          {detailId !== null && <PromotionDetail promotionId={detailId} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
