interface Props {
  categories: string[]
  selectedCategory: string | null
  onCategoryChange: (category: string | null) => void
}

export function CategoryFilter({ categories, selectedCategory, onCategoryChange }: Props) {
  if (categories.length === 0) return null

  return (
    <div className="flex w-full gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
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
