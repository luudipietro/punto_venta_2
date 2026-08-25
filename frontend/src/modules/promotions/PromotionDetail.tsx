import { useCategories } from '@/hooks/useCategories'
import { useProducts } from '@/hooks/useProducts'
import { usePromotion } from '@/hooks/usePromotions'
import { formatCurrency } from '@/lib/format'
import type { PromotionItemRead } from '@/api/promotion'

function describeItem(
  item: PromotionItemRead,
  productName: string | undefined,
  categoryName: string | undefined,
): string {
  const target = item.product_id !== null ? (productName ?? `Producto #${item.product_id}`) : `Categoría: ${categoryName ?? `#${item.category_id}`}`
  const discount =
    item.discount_type === 'percentage'
      ? `${item.discount_value}% de descuento`
      : `${formatCurrency(item.discount_value)} de descuento`
  const quantity =
    item.min_quantity > 1 ? `, desde ${item.min_quantity} unidades` : ''
  const cap = item.max_quantity !== null ? `, tope ${item.max_quantity} unidades` : ''
  return `${target} — ${discount}${quantity}${cap}`
}

export function PromotionDetail({ promotionId }: { promotionId: number }) {
  const { data: promotion, isLoading } = usePromotion(promotionId)
  const { data: products } = useProducts()
  const { data: categories } = useCategories()

  if (isLoading || !promotion) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">{promotion.name}</p>
      <p className="text-xs text-muted-foreground">
        Vigente {promotion.start_date} — {promotion.end_date ?? 'Sin fecha límite'}
      </p>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {promotion.items.map((item) => (
          <li key={item.id} className="rounded-md border px-2.5 py-1.5">
            {describeItem(
              item,
              products?.find((p) => p.id === item.product_id)?.name,
              categories?.find((c) => c.id === item.category_id)?.name,
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
