import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
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
import { useColors, useCreateColor, useDeleteColor, useUpdateColor } from '@/hooks/useColors'
import type { Color, ColorInput } from '@/api/color'

const emptyInput: ColorInput = { name: '', hex_code: '#000000' }

export function ColorsPage() {
  const { data: colors, isLoading } = useColors()
  const createMutation = useCreateColor()
  const updateMutation = useUpdateColor()
  const removeMutation = useDeleteColor()

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ColorInput>(emptyInput)

  function openCreateDialog() {
    setEditingId(null)
    setForm(emptyInput)
    setOpen(true)
  }

  function openEditDialog(color: Color) {
    setEditingId(color.id)
    setForm({ name: color.name, hex_code: color.hex_code })
    setOpen(true)
  }

  async function handleSubmit() {
    try {
      if (editingId === null) {
        await createMutation.mutateAsync(form)
        toast.success('Color creado')
      } else {
        await updateMutation.mutateAsync({ id: editingId, payload: form })
        toast.success('Color actualizado')
      }
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este color?')) return
    try {
      await removeMutation.mutateAsync(id)
      toast.success('Color eliminado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Colores"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>Nuevo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId === null ? 'Nuevo color' : 'Editar color'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="color-name">Nombre</Label>
                  <Input
                    id="color-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="color-hex">Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="color-hex"
                      type="color"
                      value={form.hex_code}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, hex_code: event.target.value }))
                      }
                      className="size-9 shrink-0 cursor-pointer rounded-md border p-0.5"
                    />
                    <Input
                      value={form.hex_code}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, hex_code: event.target.value }))
                      }
                      className="w-28 font-mono"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending || !form.name}
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
              <TableHead className="w-10" />
              <TableHead>Nombre</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {colors?.length ? (
              colors.map((color) => (
                <TableRow key={color.id}>
                  <TableCell>
                    <span
                      className="inline-block size-5 rounded-full border"
                      style={{ backgroundColor: color.hex_code }}
                    />
                  </TableCell>
                  <TableCell>{color.name}</TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(color)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(color.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Sin colores
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
