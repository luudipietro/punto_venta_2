import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
import type { DiscountType, PromotionItemInput } from '@/api/promotion'

interface DraftItem extends PromotionItemInput {
  key: string
  targetType: 'product' | 'category'
}

const emptyItem = (): DraftItem => ({
  key: crypto.randomUUID(),
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
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])

  function openCreateDialog() {
    setEditingId(null)
    setName('')
    setStartDate('')
    setEndDate('')
    setItems([emptyItem()])
    setOpen(true)
  }

  async function openEditDialog(id: number) {
    const promotion = await promotionApi.getById(id)
    setEditingId(promotion.id)
    setName(promotion.name)
    setStartDate(promotion.start_date)
    setEndDate(promotion.end_date)
    setItems(
      promotion.items.map((item) => ({
        key: crypto.randomUUID(),
        targetType: item.product_id !== null ? 'product' : 'category',
        product_id: item.product_id ?? undefined,
        category_id: item.category_id ?? undefined,
        discount_type: item.discount_type,
        discount_value: item.discount_value,
        min_quantity: item.min_quantity,
        max_quantity: item.max_quantity ?? undefined,
      })),
    )
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

  const canSubmit =
    name.trim() !== '' &&
    startDate !== '' &&
    endDate !== '' &&
    items.length > 0 &&
    items.every((item) => (item.targetType === 'product' ? item.product_id : item.category_id))

  async function handleSubmit() {
    const payload = {
      name,
      start_date: startDate,
      end_date: endDate,
      active: true,
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
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingId === null ? 'Nueva promoción' : 'Editar promoción'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="promo-name">Nombre</Label>
                  <Input id="promo-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {items.map((item) => (
                    <div key={item.key} className="grid gap-2 rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <Select
                          value={item.targetType}
                          onValueChange={(value) =>
                            updateItem(item.key, { targetType: value as 'product' | 'category' })
                          }
                        >
                          <SelectTrigger className="w-32">
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

                      <div className="grid grid-cols-4 gap-2">
                        <Select
                          value={item.discount_type}
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
                    {promotion.start_date} — {promotion.end_date}
                  </TableCell>
                  <TableCell>
                    <Badge variant={promotion.active ? 'default' : 'secondary'}>
                      {promotion.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
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
    </div>
  )
}
