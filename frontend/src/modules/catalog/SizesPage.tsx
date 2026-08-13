import { SimpleCatalogPage } from '@/modules/catalog/SimpleCatalogPage'
import { useSizes, useCreateSize, useDeleteSize, useUpdateSize } from '@/hooks/useSizes'
import type { Size, SizeInput } from '@/api/size'

export function SizesPage() {
  return (
    <SimpleCatalogPage<Size, SizeInput>
      title="Talles"
      fields={[{ name: 'label', label: 'Talle' }]}
      emptyInput={{ label: '' }}
      useList={useSizes}
      useCreate={useCreateSize}
      useUpdate={useUpdateSize}
      useRemove={useDeleteSize}
    />
  )
}
