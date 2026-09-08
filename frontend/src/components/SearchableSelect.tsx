import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface SearchableSelectOption {
  value: string
  label: string
}

interface Props {
  options: SearchableSelectOption[]
  value: string | undefined
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
}

/** A `<Select>` replacement with a search box, for lists too long to scan by
 * eye — a plain shadcn `Select` has no filtering, and with 100-200 products
 * (a real complaint: picking a product/stock row while making a purchase or
 * loading stock) scrolling an unsorted dropdown to find one is slow. No new
 * dependency (no `cmdk`/`Popover`) — plain pointer events + a
 * click-outside listener, same dependency-light approach as
 * `LogoCropDialog.tsx`. Client-side substring filtering only, matching how
 * `products`/`stockOptions` are already loaded in full everywhere this is
 * used. */
export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Elegir',
  searchPlaceholder = 'Buscar...',
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const selectedLabel = options.find((option) => option.value === value)?.label

  const term = search.trim().toLowerCase()
  const filtered = term ? options.filter((option) => option.label.toLowerCase().includes(term)) : options

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
      >
        <span className={cn('truncate text-left', !selectedLabel && 'text-muted-foreground')}>
          {selectedLabel ?? placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <Input
            autoFocus
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="mb-1"
          />
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados.</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onValueChange(option.value)
                    setOpen(false)
                    setSearch('')
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <Check
                    className={cn('size-3.5 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
