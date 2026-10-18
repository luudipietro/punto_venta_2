export type SortKey = 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc'

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'price-asc', label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
  { value: 'name-asc', label: 'Nombre: A a Z' },
  { value: 'name-desc', label: 'Nombre: Z a A' },
]

export function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((option) => option.value === value)
}

interface Props {
  value: SortKey | null
  onChange: (value: SortKey | null) => void
}

export function SortSelect({ value, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Ordenar por
      <select
        value={value ?? ''}
        onChange={(event) => onChange(isSortKey(event.target.value) ? event.target.value : null)}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Destacados</option>
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
