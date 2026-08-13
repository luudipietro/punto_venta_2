import { useState } from 'react'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pencil, Trash2 } from 'lucide-react'

interface Field<TInput> {
  name: keyof TInput & string
  label: string
  type?: 'text' | 'number' | 'checkbox'
  optional?: boolean
}

interface WithId {
  id: number
}

interface SimpleCatalogPageProps<TRead extends WithId, TInput extends object> {
  title: string
  description?: string
  fields: Field<TInput>[]
  emptyInput: TInput
  useList: () => UseQueryResult<TRead[]>
  useCreate: () => UseMutationResult<TRead, Error, TInput>
  useUpdate: () => UseMutationResult<TRead, Error, { id: number; payload: TInput }>
  useRemove: () => UseMutationResult<void, Error, number>
}

/** Generic list+create+edit+delete screen for the simple name-only (or
 * name/description) catalog entities — category, brand, color, size,
 * branch, payment method. Mirrors the backend's generic CrudService: one
 * shared implementation, one small config file per entity. */
export function SimpleCatalogPage<TRead extends WithId, TInput extends object>({
  title,
  description,
  fields,
  emptyInput,
  useList,
  useCreate,
  useUpdate,
  useRemove,
}: SimpleCatalogPageProps<TRead, TInput>) {
  const { data: items, isLoading } = useList()
  const createMutation = useCreate()
  const updateMutation = useUpdate()
  const removeMutation = useRemove()

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<TInput>(emptyInput)

  function openCreateDialog() {
    setEditingId(null)
    setForm(emptyInput)
    setOpen(true)
  }

  function openEditDialog(item: TRead) {
    setEditingId(item.id)
    setForm(fields.reduce((acc, field) => ({ ...acc, [field.name]: item[field.name as keyof TRead] }), { ...emptyInput }))
    setOpen(true)
  }

  async function handleSubmit() {
    try {
      if (editingId === null) {
        await createMutation.mutateAsync(form)
        toast.success(`${title} creado`)
      } else {
        await updateMutation.mutateAsync({ id: editingId, payload: form })
        toast.success(`${title} actualizado`)
      }
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este registro?')) return
    try {
      await removeMutation.mutateAsync(id)
      toast.success(`${title} eliminado`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>Nuevo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId === null ? `Nuevo` : `Editar`} {title.toLowerCase()}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                {fields.map((field) =>
                  field.type === 'checkbox' ? (
                    <label key={field.name} className="flex items-center gap-2 text-sm">
                      <input
                        id={field.name}
                        type="checkbox"
                        checked={Boolean(form[field.name as keyof TInput])}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, [field.name]: event.target.checked }) as TInput)
                        }
                      />
                      {field.label}
                    </label>
                  ) : (
                    <div key={field.name} className="grid gap-1.5">
                      <Label htmlFor={field.name}>{field.label}</Label>
                      <Input
                        id={field.name}
                        type={field.type ?? 'text'}
                        value={(form[field.name as keyof TInput] as string | number | undefined) ?? ''}
                        onChange={(event) =>
                          setForm(
                            (prev) =>
                              ({
                                ...prev,
                                [field.name]:
                                  field.type === 'number'
                                    ? Number(event.target.value)
                                    : event.target.value,
                              }) as TInput,
                          )
                        }
                      />
                    </div>
                  ),
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {fields.map((field) => (
                <TableHead key={field.name}>{field.label}</TableHead>
              ))}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.length ? (
              items.map((item) => (
                <TableRow key={item.id}>
                  {fields.map((field) => (
                    <TableCell key={field.name}>
                      {field.type === 'checkbox'
                        ? item[field.name as keyof TRead]
                          ? 'Sí'
                          : 'No'
                        : String(item[field.name as keyof TRead] ?? '')}
                    </TableCell>
                  ))}
                  <TableCell className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={fields.length + 1} className="text-center text-muted-foreground">
                  Sin registros
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
