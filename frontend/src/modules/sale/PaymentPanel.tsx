import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { formatCurrency } from '@/lib/format'
import { applySurcharge } from '@/lib/payment'
import { Plus, Trash2 } from 'lucide-react'

export interface PaymentLine {
  key: string
  paymentMethodId: number | null
  amountWithoutSurcharge: number
}

interface PaymentPanelProps {
  payments: PaymentLine[]
  onChange: (payments: PaymentLine[]) => void
  total: number
}

export function PaymentPanel({ payments, onChange, total }: PaymentPanelProps) {
  const { data: paymentMethods } = usePaymentMethods()

  function addLine() {
    onChange([...payments, { key: crypto.randomUUID(), paymentMethodId: null, amountWithoutSurcharge: 0 }])
  }

  function updateLine(key: string, patch: Partial<PaymentLine>) {
    onChange(payments.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function removeLine(key: string) {
    onChange(payments.filter((line) => line.key !== key))
  }

  function surchargeFor(line: PaymentLine): number {
    const method = paymentMethods?.find((item) => item.id === line.paymentMethodId)
    if (!method) return line.amountWithoutSurcharge
    return applySurcharge(line.amountWithoutSurcharge, method.surcharge_percentage)
  }

  const paidWithSurcharge = payments.reduce((sum, line) => sum + surchargeFor(line), 0)
  const remaining = Math.round((total - paidWithSurcharge) * 100) / 100

  return (
    <div className="flex flex-col gap-2">
      {payments.map((line) => {
        const method = paymentMethods?.find((item) => item.id === line.paymentMethodId)
        return (
          <div key={line.key} className="flex items-center gap-2">
            <Select
              value={line.paymentMethodId ? String(line.paymentMethodId) : undefined}
              onValueChange={(value) => updateLine(line.key, { paymentMethodId: Number(value) })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Método" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods?.map((pm) => (
                  <SelectItem key={pm.id} value={String(pm.id)}>
                    {pm.name}
                    {pm.surcharge_percentage > 0 ? ` (+${pm.surcharge_percentage}%)` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              placeholder="Monto"
              value={line.amountWithoutSurcharge || ''}
              onChange={(event) =>
                updateLine(line.key, { amountWithoutSurcharge: Number(event.target.value) || 0 })
              }
              className="flex-1"
            />
            {method && method.surcharge_percentage > 0 && (
              <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                {formatCurrency(surchargeFor(line))}
              </span>
            )}
            <Button variant="ghost" size="icon" className="size-7" onClick={() => removeLine(line.key)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )
      })}

      <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={addLine}>
        <Plus className="size-3.5" />
        Agregar método de pago
      </Button>

      <div className="mt-2 flex justify-between text-sm">
        <span className="text-muted-foreground">
          {remaining > 0 ? 'Falta cubrir' : remaining < 0 ? 'Sobra' : 'Cubierto'}
        </span>
        <span className={remaining !== 0 ? 'font-medium text-amber-600 dark:text-amber-400' : 'font-medium text-emerald-600 dark:text-emerald-400'}>
          {formatCurrency(Math.abs(remaining))}
        </span>
      </div>
    </div>
  )
}
