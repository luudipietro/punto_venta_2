import { useMemo } from 'react'
import { useProducts } from '@/hooks/useProducts'
import { useStocks } from '@/hooks/useStocks'
import { useColors } from '@/hooks/useColors'
import { useSizes } from '@/hooks/useSizes'

export interface StockOption {
  stockId: number
  branchId: number
  label: string
}

/** Stock rows joined with their product/color/size for display in selects
 * (Purchase and Exchange item pickers) — optionally scoped to one branch. */
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
        const variantParts = [
          stock.color_id !== null ? colorById.get(stock.color_id)?.name : null,
          stock.size_id !== null ? sizeById.get(stock.size_id)?.label : null,
        ].filter(Boolean)
        const variant = variantParts.length ? ` (${variantParts.join(' / ')})` : ''
        return { stockId: stock.id, branchId: stock.branch_id, label: `${product.name}${variant}` }
      })
      .filter((option): option is StockOption => option !== null)
  }, [products.data, stocks.data, colors.data, sizes.data, branchId])

  return { options, isLoading }
}
