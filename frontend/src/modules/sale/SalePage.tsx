import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useCreateSale, usePreviewSale } from '@/hooks/useSales'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { netAmountFor, summarizePayments } from '@/lib/payment'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore } from '@/modules/sale/cartStore'
import { CustomerPicker } from '@/modules/sale/CustomerPicker'
import { ProductPicker } from '@/modules/sale/ProductPicker'
import { CartPanel } from '@/modules/sale/CartPanel'
import { PaymentPanel, type PaymentLine } from '@/modules/sale/PaymentPanel'
import type { SalePreviewRead } from '@/api/sale'

export function SalePage() {
  const { data: paymentMethods } = usePaymentMethods()
  const { branchId, lines, discount, discountReason, setBranch, clear } = useCartStore()
  const activeBranchId = useAuthStore((s) => s.activeBranchId)
  const [payments, setPayments] = useState<PaymentLine[]>([])
  const [preview, setPreview] = useState<SalePreviewRead>()
  const [customerId, setCustomerId] = useState<number | null>(null)

  const previewMutation = usePreviewSale()
  const createSaleMutation = useCreateSale()

  // The cart's branch always mirrors the topbar's active branch — there's no
  // per-page selector anymore (see BranchSelector.tsx). Switching branch
  // clears the cart, same as the old manual selector already did.
  useEffect(() => {
    if (activeBranchId !== null && activeBranchId !== branchId) {
      setBranch(activeBranchId)
    }
  }, [activeBranchId, branchId, setBranch])

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

  const { isBalanced } = summarizePayments(payments, paymentMethods, total)
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
          amount_without_surcharge: netAmountFor(line, paymentMethods),
          amount_with_surcharge: line.amount,
        })),
        customer_id: customerId,
      })
      toast.success('Venta registrada')
      clear()
      setPayments([])
      setCustomerId(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la venta')
    }
  }

  return (
    <div>
      <PageHeader title="Venta" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProductPicker branchId={branchId} />
        </div>

        <Card className="flex flex-col gap-4 p-4 lg:sticky lg:top-4 lg:self-start">
          <CartPanel preview={preview} previewLoading={previewMutation.isPending} />

          {lines.length > 0 && (
            <>
              <div className="border-t pt-3">
                <CustomerPicker customerId={customerId} onChange={setCustomerId} />
              </div>

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
