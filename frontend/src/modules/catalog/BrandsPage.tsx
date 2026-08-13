import { SimpleCatalogPage } from '@/modules/catalog/SimpleCatalogPage'
import { useBrands, useCreateBrand, useDeleteBrand, useUpdateBrand } from '@/hooks/useBrands'
import type { Brand, BrandInput } from '@/api/brand'

export function BrandsPage() {
  return (
    <SimpleCatalogPage<Brand, BrandInput>
      title="Marcas"
      fields={[
        { name: 'name', label: 'Nombre' },
        { name: 'description', label: 'Descripción' },
      ]}
      emptyInput={{ name: '', description: '' }}
      useList={useBrands}
      useCreate={useCreateBrand}
      useUpdate={useUpdateBrand}
      useRemove={useDeleteBrand}
    />
  )
}
