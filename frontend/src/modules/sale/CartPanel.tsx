import { useEffect, useState } from 'react'
import type { SalePreviewRead } from '@/api/sale'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/format'
import { useCartStore } from '@/modules/sale/cartStore'
import { PromotionDetail } from '@/modules/promotions/PromotionDetail'
import { Minus, Plus, Trash2 } from 'lucide-react'

interface CartPanelProps {
  preview: SalePreviewRead | undefined
  previewLoading: boolean
}

type DiscountMode = 'amount' | 'percent'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function CartPanel({ preview, previewLoading }: CartPanelProps) {
  const { lines, discount, discountReason, setQuantity, removeLine, setDiscount, setDiscountReason } =
    useCartStore()

  const fallbackSubtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const subtotal = preview?.subtotal ?? fallbackSubtotal

  const [discountMode, setDiscountMode] = useState<DiscountMode>('amount')
  const [discountRawValue, setDiscountRawValue] = useState(0)
  const [detailPromotionId, setDetailPromotionId] = useState<number | null>(null)

  const appliedPromotionIds = Array.from(
    new Set(
      (preview?.items ?? [])
        .map((item) => item.promotion_id)
        .filter((id): id is number => id !== null),
    ),
  )

  // Cart total changing (e.g. quantity edited) shouldn't silently freeze a
  // percentage discount at its old amount — recompute it against the new subtotal.
  useEffect(() => {
    if (discountMode === 'percent') {
      setDiscount(round2(subtotal * (discountRawValue / 100)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal])

  function handleDiscountModeChange(mode: DiscountMode) {
    if (mode === discountMode) return
    if (mode === 'percent') {
      const percent = subtotal > 0 ? (discount / subtotal) * 100 : 0
      setDiscountRawValue(round2(percent))
    } else {
      setDiscountRawValue(discount)
    }
    setDiscountMode(mode)
  }

  function handleDiscountValueChange(value: number) {
    setDiscountRawValue(value)
    setDiscount(discountMode === 'percent' ? round2(subtotal * (value / 100)) : value)
  }

  return (
    <div className="flex flex-col gap-3">
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">El carrito está vacío. Tocá un producto para agregarlo.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {lines.map((line) => (
            <div key={line.stockId} className="flex items-center gap-2 rounded-md border p-2">
              {line.imageUrl ? (
                <img
                  src={line.imageUrl}
                  alt=""
                  className="size-8 shrink-0 rounded-md border object-cover"
                  onError={(event) => {
                    event.currentTarget.style.visibility = 'hidden'
                  }}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{line.productName}</p>
                {line.variantLabel && (
                  <p className="text-xs text-muted-foreground">{line.variantLabel}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7"
                  onClick={() => setQuantity(line.stockId, line.quantity - 1)}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-6 text-center text-sm">{line.quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7"
                  disabled={line.quantity >= line.availableQuantity}
                  onClick={() => setQuantity(line.stockId, line.quantity + 1)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <span className="w-20 text-right text-sm font-medium">
                {formatCurrency(line.unitPrice * line.quantity)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={() => removeLine(line.stockId)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="discount">Descuento manual</Label>
          <div className="flex gap-1">
            <div className="flex overflow-hidden rounded-md border">
              <button
                type="button"
                onClick={() => handleDiscountModeChange('amount')}
                className={
                  'px-2 text-sm ' +
                  (discountMode === 'amount' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')
                }
              >
                $
              </button>
              <button
                type="button"
                onClick={() => handleDiscountModeChange('percent')}
                className={
                  'px-2 text-sm ' +
                  (discountMode === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')
                }
              >
                %
              </button>
            </div>
            <Input
              id="discount"
              type="number"
              min={0}
              max={discountMode === 'percent' ? 100 : undefined}
              value={discountRawValue || ''}
              placeholder="0"
              onChange={(event) => handleDiscountValueChange(Number(event.target.value) || 0)}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="discount-reason">Motivo</Label>
          <Input
            id="discount-reason"
            value={discountReason}
            placeholder="Ej: cliente frecuente"
            onChange={(event) => setDiscountReason(event.target.value)}
          />
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(preview?.subtotal ?? fallbackSubtotal)}</span>
        </div>
        {(preview?.promotion_discount ?? 0) > 0 && (
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="flex items-center gap-1.5">
              Promoción aplicada
              {appliedPromotionIds.map((promotionId) => (
                <button
                  key={promotionId}
                  type="button"
                  onClick={() => setDetailPromotionId(promotionId)}
                  className="underline decoration-dotted underline-offset-2"
                >
                  (ver)
                </button>
              ))}
            </span>
            <span>-{formatCurrency(preview!.promotion_discount)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Descuento</span>
            <span>-{formatCurrency(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold">
          <span>Total{previewLoading ? ' (calculando...)' : ''}</span>
          <span>{formatCurrency(preview?.total ?? fallbackSubtotal - discount)}</span>
        </div>
      </div>

      <Dialog
        open={detailPromotionId !== null}
        onOpenChange={(isOpen) => !isOpen && setDetailPromotionId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle de la promoción</DialogTitle>
          </DialogHeader>
          {detailPromotionId !== null && <PromotionDetail promotionId={detailPromotionId} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
