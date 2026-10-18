import { useMemo, useState } from 'react'
import { PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useProducts } from '@/hooks/useProducts'
import { useCategories, useSetCategoryProducts } from '@/hooks/useCategories'
import { getMediaUrl } from '@/lib/media'
import type { Category } from '@/api/category'

/** Pick which products belong to a category, without editing each product.
 * Saving sets the category's membership to exactly the checked products — a
 * product has a single category, so checking one that belongs to another
 * category moves it here (its current category is shown next to it). */
export function CategoryProductsDialog({ category }: { category: Category }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const { data: products } = useProducts()
  const { data: categories } = useCategories()
  const setProducts = useSetCategoryProducts()

  function openDialog() {
    setSelected(
      new Set((products ?? []).filter((p) => p.category_id === category.id).map((p) => p.id)),
    )
    setSearch('')
    setOpen(true)
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (products ?? [])
      .filter((p) => !term || p.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products, search])

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    try {
      await setProducts.mutateAsync({ id: category.id, productIds: Array.from(selected) })
      toast.success('Productos de la categoría actualizados')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon" title="Productos de la categoría" onClick={openDialog}>
        <PackagePlus className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Productos en «{category.name}»</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Buscar producto..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {visible.map((product) => {
              const otherCategory =
                product.category_id !== null && product.category_id !== category.id
                  ? categories?.find((c) => c.id === product.category_id)?.name
                  : null
              return (
                <li key={product.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md p-1.5 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggle(product.id)}
                    />
                    {product.image_url ? (
                      <img
                        src={getMediaUrl(product.image_url)}
                        alt=""
                        className="size-9 rounded-md border object-cover"
                        onError={(event) => {
                          event.currentTarget.style.visibility = 'hidden'
                        }}
                      />
                    ) : (
                      <div className="size-9 rounded-md border bg-muted" />
                    )}
                    <span className="flex-1 truncate text-sm">{product.name}</span>
                    {otherCategory && (
                      <span className="text-xs text-muted-foreground">en {otherCategory}</span>
                    )}
                  </label>
                </li>
              )
            })}
            {visible.length === 0 && (
              <li className="py-4 text-center text-sm text-muted-foreground">Sin productos</li>
            )}
          </ul>
          <DialogFooter className="items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">{selected.size} seleccionados</span>
            <Button onClick={handleSave} disabled={setProducts.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
