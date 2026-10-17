import { useMemo } from 'react'
import { useProducts } from '@/hooks/useProducts'
import { useStocks } from '@/hooks/useStocks'
import { useColors } from '@/hooks/useColors'
import { useSizes } from '@/hooks/useSizes'
import { getMediaUrl } from '@/lib/media'

export interface SaleCatalogEntry {
  stockId: number
  productId: number
  productName: string
  variantLabel: string
  colorName: string | null
  sizeLabel: string | null
  colorHex: string | null
  imageUrl: string | null
  unitPrice: number
  availableQuantity: number
}

/** Joins Stock rows (scoped to a branch) with their Product/Color/Size so the
 * POS product picker can show a ready-to-sell list without the backend
 * needing a dedicated "stock with product details" endpoint. */
export function useSaleCatalog(branchId: number | null) {
  const products = useProducts()
  const stocks = useStocks()
  const colors = useColors()
  const sizes = useSizes()

  const isLoading = products.isLoading || stocks.isLoading || colors.isLoading || sizes.isLoading

  const entries = useMemo<SaleCatalogEntry[]>(() => {
    if (!products.data || !stocks.data || !colors.data || !sizes.data || branchId === null) return []

    const productById = new Map(products.data.map((product) => [product.id, product]))
    const colorById = new Map(colors.data.map((color) => [color.id, color]))
    const sizeById = new Map(sizes.data.map((size) => [size.id, size]))

    return stocks.data
      .filter((stock) => stock.branch_id === branchId && stock.quantity > 0)
      .map((stock) => {
        const product = productById.get(stock.product_id)
        if (!product) return null
        const color = stock.color_id !== null ? colorById.get(stock.color_id) : undefined
        const sizeLabel = stock.size_id !== null ? sizeById.get(stock.size_id)?.label ?? null : null
        const variantParts = [color?.name, sizeLabel].filter(Boolean)
        return {
          stockId: stock.id,
          productId: product.id,
          productName: product.name,
          variantLabel: variantParts.join(' / '),
          colorName: color?.name ?? null,
          sizeLabel,
          colorHex: color?.hex_code ?? null,
          imageUrl: getMediaUrl(product.image_url) || null,
          unitPrice: product.price,
          availableQuantity: stock.quantity,
        }
      })
      .filter((entry): entry is SaleCatalogEntry => entry !== null)
  }, [products.data, stocks.data, colors.data, sizes.data, branchId])

  return { entries, isLoading }
}
