import { ArrowDown, ArrowUp } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export function SortableHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex items-center gap-1 text-xs font-medium uppercase',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        {active &&
          (dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  )
}
