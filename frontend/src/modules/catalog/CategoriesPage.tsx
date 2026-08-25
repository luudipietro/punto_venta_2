import { SimpleCatalogPage } from '@/modules/catalog/SimpleCatalogPage'
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/hooks/useCategories'
import type { Category, CategoryInput } from '@/api/category'

export function CategoriesPage() {
  return (
    <SimpleCatalogPage<Category, CategoryInput>
      title="Categorías"
      description="Categorías de producto (ropa, calzado, accesorios...)"
      fields={[
        { name: 'name', label: 'Nombre' },
        { name: 'description', label: 'Descripción' },
      ]}
      emptyInput={{ name: '', description: '' }}
      useList={useCategories}
      useCreate={useCreateCategory}
      useUpdate={useUpdateCategory}
      useRemove={useDeleteCategory}
      allowEdit={false}
    />
  )
}
