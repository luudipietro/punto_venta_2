import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
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
import { useExchange, useExchanges } from '@/hooks/useExchanges'
import { useSale, useSales } from '@/hooks/useSales'
import { formatCurrency } from '@/lib/format'
import { ExchangeForm } from '@/modules/exchanges/ExchangeForm'

export function ExchangesPage() {
  const { data: exchanges, isLoading } = useExchanges()
  const { data: sales } = useSales()

  const [open, setOpen] = useState(false)
  const [saleId, setSaleId] = useState<number | null>(null)
  const { data: sale } = useSale(saleId ?? undefined)

  function openCreateDialog() {
    setSaleId(null)
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Cambios y devoluciones"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>Nuevo</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Venta</TableHead>
              <TableHead>Ítems devueltos</TableHead>
              <TableHead>Ítems nuevos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exchanges?.length ? (
              [...exchanges]
                .sort((a, b) => b.id - a.id)
                .map((exchange) => (
                  <ExchangeRow key={exchange.id} id={exchange.id} saleId={exchange.sale_id} />
                ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin cambios registrados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function ExchangeRow({ id, saleId }: { id: number; saleId: number }) {
  const { data: detail } = useExchange(id)
  return (
    <TableRow>
      <TableCell>{id}</TableCell>
      <TableCell>Venta #{saleId}</TableCell>
      <TableCell>{detail?.returned_items.length ?? '-'}</TableCell>
      <TableCell>{detail?.new_items.length ?? '-'}</TableCell>
    </TableRow>
  )
}
