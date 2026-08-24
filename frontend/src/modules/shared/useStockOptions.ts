import { useMemo } from 'react'
import { useProducts } from '@/hooks/useProducts'
import { useStocks } from '@/hooks/useStocks'
import { useColors } from '@/hooks/useColors'
import { useSizes } from '@/hooks/useSizes'

export interface StockOption {
  stockId: number
  branchId: number
  productId: number
  productName: string
  price: number
  variantLabel: string
  colorHex: string | null
  imageUrl: string | null
  label: string
}

/** Stock rows joined with their product/color/size for display — optionally
 * scoped to one branch. Pass a `branchId` when using this as a *picker* for
 * new stock to add (Purchase items, Exchange new items) — that's the only
 * case where "must belong to this branch" makes sense. Call it with no
 * `branchId` when *displaying* an already-recorded stock_id (a past Sale,
 * Purchase, or Exchange line): a stock row's branch can drift from what it
 * was at the time, and a historical record shouldn't lose its product name
 * just because of that (see the "Stock #N" bug in SaleDetailPanel). */
export function useStockOptions(branchId?: number | null) {
  const products = useProducts()
  const stocks = useStocks()
  const colors = useColors()
  const sizes = useSizes()

  const isLoading = products.isLoading || stocks.isLoading || colors.isLoading || sizes.isLoading

  const options = useMemo<StockOption[]>(() => {
    if (!products.data || !stocks.data || !colors.data || !sizes.data) return []

    const productById = new Map(products.data.map((product) => [product.id, product]))
    const colorById = new Map(colors.data.map((color) => [color.id, color]))
    const sizeById = new Map(sizes.data.map((size) => [size.id, size]))

    return stocks.data
      .filter((stock) => (branchId ? stock.branch_id === branchId : true))
      .map((stock) => {
        const product = productById.get(stock.product_id)
        if (!product) return null
        const color = stock.color_id !== null ? colorById.get(stock.color_id) : undefined
        const variantParts = [
          color?.name,
          stock.size_id !== null ? sizeById.get(stock.size_id)?.label : null,
        ].filter(Boolean)
        const variantLabel = variantParts.join(' / ')
        const label = variantLabel ? `${product.name} (${variantLabel})` : product.name
        return {
          stockId: stock.id,
          branchId: stock.branch_id,
          productId: product.id,
          productName: product.name,
          price: product.price,
          variantLabel,
          colorHex: color?.hex_code ?? null,
          imageUrl: product.image_url,
          label,
        }
      })
      .filter((option): option is StockOption => option !== null)
  }, [products.data, stocks.data, colors.data, sizes.data, branchId])

  return { options, isLoading }
}
