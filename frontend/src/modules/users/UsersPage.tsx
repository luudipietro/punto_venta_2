import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBranches } from '@/hooks/useBranches'
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from '@/hooks/useUsers'
import { useAuthStore } from '@/stores/authStore'
import type { User } from '@/api/user'
import type { UserRole } from '@/stores/authStore'

/** Not built on `SimpleCatalogPage` — the form has conditional logic (the
 * branch field only applies to "empleado", password is required on create
 * but optional on edit) that the generic page doesn't support. */
export function UsersPage() {
  const { data: users, isLoading } = useUsers()
  const { data: branches } = useBranches()
  const authUser = useAuthStore((s) => s.user)
  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser()
  const removeMutation = useDeleteUser()

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [role, setRole] = useState<UserRole>('empleado')
  const [branchId, setBranchId] = useState<number | null>(null)

  const isEditingSelf = editingId !== null && editingId === authUser?.id
  const changingOwnPassword = isEditingSelf && password.trim() !== ''

  function openCreateDialog() {
    setEditingId(null)
    setUsername('')
    setPassword('')
    setCurrentPassword('')
    setRole('empleado')
    setBranchId(null)
    setOpen(true)
  }

  function openEditDialog(user: User) {
    setEditingId(user.id)
    setUsername(user.username)
    setPassword('')
    setCurrentPassword('')
    setRole(user.role)
    setBranchId(user.branch_id)
    setOpen(true)
  }

  const canSubmit =
    username.trim() !== '' &&
    (editingId !== null || password.trim() !== '') &&
    (role === 'admin' || branchId !== null) &&
    (!changingOwnPassword || currentPassword.trim() !== '')

  async function handleSubmit() {
    const payload = {
      username,
      role,
      branch_id: role === 'empleado' ? branchId : null,
      ...(password.trim() !== '' ? { password } : {}),
      ...(changingOwnPassword ? { current_password: currentPassword } : {}),
    }
    try {
      if (editingId === null) {
        await createMutation.mutateAsync(payload)
        toast.success('Usuario creado')
      } else {
        await updateMutation.mutateAsync({ id: editingId, payload })
        toast.success('Usuario actualizado')
      }
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar este usuario?')) return
    try {
      await removeMutation.mutateAsync(id)
      toast.success('Usuario eliminado')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Usuarios"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>Nuevo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId === null ? 'Nuevo usuario' : 'Editar usuario'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="user-username">Usuario</Label>
                  <Input
                    id="user-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="user-password">
                    Contraseña{editingId !== null && ' (dejar vacío para no cambiarla)'}
                  </Label>
                  <Input
                    id="user-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                {changingOwnPassword && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="user-current-password">Contraseña actual</Label>
                    <Input
                      id="user-current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Necesaria para confirmar que sos vos quien cambia tu propia contraseña.
                    </p>
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>Rol</Label>
                  <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="empleado">Empleado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {role === 'empleado' && (
                  <div className="grid gap-1.5">
                    <Label>Sucursal</Label>
                    <Select
                      value={branchId ? String(branchId) : undefined}
                      onValueChange={(value) => setBranchId(Number(value))}
                    >
                      <SelectTrigger>
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
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
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
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.length ? (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role === 'admin' ? 'Administrador' : 'Empleado'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {branches?.find((branch) => branch.id === user.branch_id)?.name ?? '-'}
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(user)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin usuarios
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
