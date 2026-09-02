import { Search } from 'lucide-react'

interface Props {
  search: string
  onSearchChange: (value: string) => void
  categories: string[]
  selectedCategory: string | null
  onCategoryChange: (category: string | null) => void
}

export function SearchAndFilters({
  search,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
}: Props) {
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar productos..."
            className="w-full rounded-lg border border-border bg-card py-2 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <FilterChip
              label="Todas"
              active={selectedCategory === null}
              onClick={() => onCategoryChange(null)}
            />
            {categories.map((category) => (
              <FilterChip
                key={category}
                label={category}
                active={selectedCategory === category}
                onClick={() => onCategoryChange(category)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:bg-accent'
      }`}
    >
      {label}
    </button>
  )
}
