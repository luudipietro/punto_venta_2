import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBranches } from '@/hooks/useBranches'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useCreateSale, usePreviewSale } from '@/hooks/useSales'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { applySurcharge } from '@/lib/payment'
import { useCartStore } from '@/modules/sale/cartStore'
import { ProductPicker } from '@/modules/sale/ProductPicker'
import { CartPanel } from '@/modules/sale/CartPanel'
import { PaymentPanel, type PaymentLine } from '@/modules/sale/PaymentPanel'
import type { SalePreviewRead } from '@/api/sale'

export function SalePage() {
  const { data: branches } = useBranches()
  const { data: paymentMethods } = usePaymentMethods()
  const { branchId, lines, discount, discountReason, setBranch, clear } = useCartStore()
  const [payments, setPayments] = useState<PaymentLine[]>([])
  const [preview, setPreview] = useState<SalePreviewRead>()

  const previewMutation = usePreviewSale()
  const createSaleMutation = useCreateSale()

  useEffect(() => {
    if (branchId === null && branches && branches.length > 0) {
      setBranch(branches[0].id)
    }
  }, [branches, branchId, setBranch])

  const debouncedLines = useDebouncedValue(lines, 400)
  const debouncedDiscount = useDebouncedValue(discount, 400)

  useEffect(() => {
    if (branchId === null || debouncedLines.length === 0) {
      setPreview(undefined)
      return
    }
    previewMutation.mutate(
      {
        branch_id: branchId,
        discount: debouncedDiscount,
        discount_reason: discountReason || undefined,
        items: debouncedLines.map((line) => ({
          stock_id: line.stockId,
          quantity: line.quantity,
          unit_price: line.unitPrice,
        })),
      },
      {
        onSuccess: (data) => setPreview(data),
        onError: () => setPreview(undefined),
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, debouncedLines, debouncedDiscount, discountReason])

  const total = preview?.total ?? 0

  function surchargeFor(line: PaymentLine): number {
    const method = paymentMethods?.find((item) => item.id === line.paymentMethodId)
    if (!method) return line.amountWithoutSurcharge
    return applySurcharge(line.amountWithoutSurcharge, method.surcharge_percentage)
  }

  const paidWithSurcharge = payments.reduce((sum, line) => sum + surchargeFor(line), 0)
  const isBalanced = Math.abs(total - paidWithSurcharge) < 0.005
  const canConfirm =
    branchId !== null &&
    lines.length > 0 &&
    preview !== undefined &&
    payments.length > 0 &&
    payments.every((line) => line.paymentMethodId !== null) &&
    isBalanced

  async function handleConfirm() {
    if (branchId === null || !preview) return
    try {
      await createSaleMutation.mutateAsync({
        branch_id: branchId,
        discount,
        discount_reason: discountReason || undefined,
        items: lines.map((line) => ({
          stock_id: line.stockId,
          quantity: line.quantity,
          unit_price: line.unitPrice,
        })),
        payments: payments.map((line) => ({
          payment_method_id: line.paymentMethodId as number,
          amount_without_surcharge: line.amountWithoutSurcharge,
          amount_with_surcharge: surchargeFor(line),
        })),
      })
      toast.success('Venta registrada')
      clear()
      setPayments([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la venta')
    }
  }

  return (
    <div>
      <PageHeader
        title="Venta"
        action={
          <Select
            value={branchId ? String(branchId) : undefined}
            onValueChange={(value) => setBranch(Number(value))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sucursal" />
            </SelectTrigger>
            <SelectContent>
              {branches?.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProductPicker branchId={branchId} />
        </div>

        <Card className="flex flex-col gap-4 p-4 lg:sticky lg:top-4 lg:self-start">
          <CartPanel preview={preview} previewLoading={previewMutation.isPending} />

          {lines.length > 0 && (
            <>
              <div className="border-t pt-3">
                <p className="mb-2 text-sm font-medium">Pago</p>
                <PaymentPanel payments={payments} onChange={setPayments} total={total} />
              </div>

              <Button
                size="lg"
                disabled={!canConfirm || createSaleMutation.isPending}
                onClick={handleConfirm}
              >
                Confirmar venta
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
