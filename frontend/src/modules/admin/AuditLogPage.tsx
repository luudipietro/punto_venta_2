import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuditLogs } from '@/hooks/useAuditLogs'
import { useBranches } from '@/hooks/useBranches'
import { formatTimestamp } from '@/lib/format'

const CANCEL_ACTIONS = ['sale.cancel', 'purchase.cancel', 'exchange.cancel']

const ACTION_LABELS: Record<string, string> = {
  'sale.create': 'Venta registrada',
  'sale.cancel': 'Venta cancelada',
  'purchase.create': 'Compra registrada',
  'purchase.pay': 'Compra marcada como pagada',
  'purchase.cancel': 'Compra cancelada',
  'exchange.create': 'Cambio registrado',
  'exchange.cancel': 'Cambio cancelado',
  'stock.increase': 'Stock aumentado manualmente',
  'stock.decrease': 'Stock reducido manualmente',
  'user.create': 'Usuario creado',
  'user.update': 'Usuario actualizado',
  'user.delete': 'Usuario eliminado',
  'customer.create': 'Cliente creado',
  'customer.update': 'Cliente actualizado',
  'customer.delete': 'Cliente eliminado',
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function AuditLogPage() {
  const { data: branches } = useBranches()
  const [startDate, setStartDate] = useState(daysAgoIso(30))
  const [endDate, setEndDate] = useState(todayIso())
  const [branchId, setBranchId] = useState<number | 'all'>('all')
  const [actionFilter, setActionFilter] = useState<'all' | 'cancelled'>('all')

  const { data: entries, isLoading } = useAuditLogs({
    startDate,
    endDate,
    branchId: branchId === 'all' ? null : branchId,
  })

  const visible = useMemo(() => {
    if (!entries) return []
    if (actionFilter === 'cancelled') {
      return entries.filter((entry) => CANCEL_ACTIONS.includes(entry.action))
    }
    return entries
  }, [entries, actionFilter])

  return (
    <div>
      <PageHeader
        title="Trazabilidad"
        description="Historial de quién hizo qué cambio, cuándo y en qué sucursal."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="audit-start">Desde</Label>
          <Input
            id="audit-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-end">Hasta</Label>
          <Input
            id="audit-end"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Sucursal</Label>
          <Select
            value={String(branchId)}
            onValueChange={(value) => setBranchId(value === 'all' ? 'all' : Number(value))}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches?.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Tipo</Label>
          <Select
            value={actionFilter}
            onValueChange={(value) => setActionFilter(value as 'all' | 'cancelled')}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los eventos</SelectItem>
              <SelectItem value="cancelled">
                Solo ventas / compras / cambios cancelados
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length ? (
              visible.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatTimestamp(entry.created_at)}
                  </TableCell>
                  <TableCell>{entry.actor_username}</TableCell>
                  <TableCell>{ACTION_LABELS[entry.action] ?? entry.action}</TableCell>
                  <TableCell className="max-w-md whitespace-normal">{entry.summary}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin eventos en el rango seleccionado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
