import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateCustomer, useCustomer, useSearchCustomers } from '@/hooks/useCustomers'

interface CustomerPickerProps {
  customerId: number | null
  onChange: (customerId: number | null) => void
}

/** Optional customer picker for checkout: search by dni/name, pick a match,
 * or create a new customer inline if none matches. The sale can always be
 * confirmed without a customer — this is purely additive. */
export function CustomerPicker({ customerId, onChange }: CustomerPickerProps) {
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newDni, setNewDni] = useState('')
  const [newName, setNewName] = useState('')

  const { data: selected } = useCustomer(customerId ?? undefined)
  const { data: results, isFetching } = useSearchCustomers(search)
  const createMutation = useCreateCustomer()

  async function handleCreate() {
    try {
      const customer = await createMutation.mutateAsync({ dni: newDni, name: newName })
      onChange(customer.id)
      setSearch('')
      setShowCreate(false)
      setNewDni('')
      setNewName('')
      toast.success('Cliente creado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el cliente')
    }
  }

  if (customerId !== null) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Cliente:</span>
        <Badge variant="secondary" className="gap-1.5">
          {selected ? `${selected.name} (${selected.dni})` : `#${customerId}`}
          <button type="button" onClick={() => onChange(null)} aria-label="Quitar cliente">
            <X className="size-3" />
          </button>
        </Badge>
      </div>
    )
  }

  return (
    <div className="grid gap-1.5">
      <Input
        placeholder="Buscar cliente por DNI o nombre (opcional)"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          setShowCreate(false)
        }}
      />

      {search.trim().length >= 2 && !showCreate && (
        <div className="flex flex-col gap-1 rounded-md border p-1">
          {isFetching ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">Buscando...</p>
          ) : results && results.length > 0 ? (
            results.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onChange(customer.id)
                  setSearch('')
                }}
              >
                {customer.name} — {customer.dni}
              </button>
            ))
          ) : (
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs text-muted-foreground">Sin resultados.</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-xs"
                onClick={() => {
                  setNewDni(/^\d+$/.test(search.trim()) ? search.trim() : '')
                  setNewName(/^\d+$/.test(search.trim()) ? '' : search.trim())
                  setShowCreate(true)
                }}
              >
                <Plus className="size-3" />
                Crear cliente
              </Button>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <div className="grid grid-cols-2 gap-2 rounded-md border p-2">
          <Input
            placeholder="DNI"
            value={newDni}
            onChange={(event) => setNewDni(event.target.value)}
          />
          <Input
            placeholder="Nombre"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button
            size="sm"
            className="col-span-2 w-fit"
            disabled={!newDni || !newName || createMutation.isPending}
            onClick={handleCreate}
          >
            Guardar cliente
          </Button>
        </div>
      )}
    </div>
  )
}
