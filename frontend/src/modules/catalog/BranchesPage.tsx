import { SimpleCatalogPage } from '@/modules/catalog/SimpleCatalogPage'
import { useBranches, useCreateBranch, useDeleteBranch, useUpdateBranch } from '@/hooks/useBranches'
import type { Branch, BranchInput } from '@/api/branch'

export function BranchesPage() {
  return (
    <SimpleCatalogPage<Branch, BranchInput>
      title="Sucursales"
      fields={[{ name: 'name', label: 'Nombre' }]}
      emptyInput={{ name: '' }}
      useList={useBranches}
      useCreate={useCreateBranch}
      useUpdate={useUpdateBranch}
      useRemove={useDeleteBranch}
    />
  )
}
