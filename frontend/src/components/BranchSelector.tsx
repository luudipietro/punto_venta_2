import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBranches } from '@/hooks/useBranches'
import { useAuthStore } from '@/stores/authStore'

/** Always-visible active-branch control in the topbar — an admin can switch
 * branches at any time without re-logging in; an empleado sees their fixed
 * branch as plain text, since `setActiveBranch` is a no-op for them anyway
 * (see authStore.ts). */
export function BranchSelector() {
  const { data: branches } = useBranches()
  const role = useAuthStore((s) => s.user?.role)
  const activeBranchId = useAuthStore((s) => s.activeBranchId)
  const setActiveBranch = useAuthStore((s) => s.setActiveBranch)

  if (role !== 'admin') {
    const branchName = branches?.find((branch) => branch.id === activeBranchId)?.name ?? '-'
    return <span className="text-sm font-medium">Sucursal: {branchName}</span>
  }

  return (
    <Select
      value={activeBranchId ? String(activeBranchId) : undefined}
      onValueChange={(value) => setActiveBranch(Number(value))}
    >
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Elegir sucursal" />
      </SelectTrigger>
      <SelectContent>
        {branches?.map((branch) => (
          <SelectItem key={branch.id} value={String(branch.id)}>
            {branch.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
