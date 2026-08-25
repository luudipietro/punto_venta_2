import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBranches } from '@/hooks/useBranches'
import { useExchange, useExchanges } from '@/hooks/useExchanges'
import { useSale, useSales } from '@/hooks/useSales'
import { formatCurrency } from '@/lib/format'
import { ExchangeDetailPanel } from '@/modules/exchanges/ExchangeDetailPanel'
import { ExchangeForm } from '@/modules/exchanges/ExchangeForm'
import { ExchangeItemsList } from '@/modules/exchanges/ExchangeItemsList'

export function ExchangesPage() {
  const { data: exchanges, isLoading } = useExchanges()
  const { data: sales } = useSales()
  const { data: branches } = useBranches()

  const [open, setOpen] = useState(false)
  const [saleId, setSaleId] = useState<number | null>(null)
  const { data: sale } = useSale(saleId ?? undefined)
  const [branchFilter, setBranchFilter] = useState<number | 'all'>('all')
  const [selectedExchangeId, setSelectedExchangeId] = useState<number | null>(null)

  function openCreateDialog() {
    setSaleId(null)
    setOpen(true)
  }

  function branchIdForExchange(exchangeSaleId: number): number | undefined {
    return sales?.find((s) => s.id === exchangeSaleId)?.branch_id
  }

  const visibleExchanges = [...(exchanges ?? [])]
    .filter(
      (exchange) => branchFilter === 'all' || branchIdForExchange(exchange.sale_id) === branchFilter,
    )
    .sort((a, b) => b.id - a.id)

  return (
    <div>
      <PageHeader
        title="Cambios y devoluciones"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>Nuevo</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nuevo cambio / devolución</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Select
                    value={saleId ? String(saleId) : undefined}
                    onValueChange={(value) => setSaleId(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir venta" />
                    </SelectTrigger>
                    <SelectContent>
                      {sales
                        ?.filter((s) => s.cancelled_at === null)
                        .map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            Venta #{s.id} — {formatCurrency(s.total)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {sale && <ExchangeForm sale={sale} onSuccess={() => setOpen(false)} />}
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-3">
        <Select
          value={String(branchFilter)}
          onValueChange={(value) => setBranchFilter(value === 'all' ? 'all' : Number(value))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sucursal" />
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Venta</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Ítems devueltos</TableHead>
              <TableHead>Ítems nuevos</TableHead>
              <TableHead>Diferencia</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleExchanges.length ? (
              visibleExchanges.map((exchange) => (
                <ExchangeRow
                  key={exchange.id}
                  id={exchange.id}
                  saleId={exchange.sale_id}
                  branchName={
                    branches?.find((b) => b.id === branchIdForExchange(exchange.sale_id))?.name ?? '-'
                  }
                  onClick={() => setSelectedExchangeId(exchange.id)}
                />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sin cambios registrados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={selectedExchangeId !== null}
        onOpenChange={(isOpen) => !isOpen && setSelectedExchangeId(null)}
      >
        <DialogContent className="max-h-[85vh] sm:max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de cambio</DialogTitle>
          </DialogHeader>
          {selectedExchangeId !== null && <ExchangeDetailPanel exchangeId={selectedExchangeId} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ExchangeRow({
  id,
  saleId,
  branchName,
  onClick,
}: {
  id: number
  saleId: number
  branchName: string
  onClick: () => void
}) {
  const { data: detail } = useExchange(id)
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onClick}>
      <TableCell>{id}</TableCell>
      <TableCell>Venta #{saleId}</TableCell>
      <TableCell>{branchName}</TableCell>
      <TableCell>
        {detail ? <ExchangeItemsList items={detail.returned_items} /> : '-'}
      </TableCell>
      <TableCell>{detail ? <ExchangeItemsList items={detail.new_items} /> : '-'}</TableCell>
      <TableCell>{detail ? formatCurrency(detail.balance) : '-'}</TableCell>
      <TableCell>
        {detail?.cancelled_at !== null && detail !== undefined ? (
          <Badge variant="destructive">Cancelado</Badge>
        ) : (
          <Badge variant="secondary">Activo</Badge>
        )}
      </TableCell>
    </TableRow>
  )
}
