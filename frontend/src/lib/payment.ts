/** A payment method's surcharge_percentage (e.g. 5 for 5%) applied to the
 * amount charged through it — the resulting `amount_with_surcharge` is what
 * the backend expects alongside the pre-surcharge amount on each SalePayment. */
export function applySurcharge(amount: number, surchargePercentage: number): number {
  return Math.round(amount * (1 + surchargePercentage / 100) * 100) / 100
}

/** Inverse of applySurcharge: given the gross amount actually charged through a
 * payment method (e.g. what the card terminal shows), returns how much of the
 * sale that payment covers net of the surcharge. */
export function removeSurcharge(amount: number, surchargePercentage: number): number {
  return Math.round((amount / (1 + surchargePercentage / 100)) * 100) / 100
}

export interface PaymentMethodLike {
  id: number
  surcharge_percentage: number
}

export interface PaymentLineLike {
  paymentMethodId: number | null
  amount: number
}

function methodFor(line: PaymentLineLike, methods: PaymentMethodLike[] | undefined) {
  return methods?.find((item) => item.id === line.paymentMethodId)
}

/** How much of the sale a single payment line covers, net of its method's
 * surcharge (0% surcharge methods, like cash, cover exactly what was entered). */
export function netAmountFor(line: PaymentLineLike, methods: PaymentMethodLike[] | undefined): number {
  const method = methodFor(line, methods)
  if (!method) return line.amount
  return removeSurcharge(line.amount, method.surcharge_percentage)
}

export interface PaymentsSummary {
  paidNet: number
  remaining: number
  isBalanced: boolean
}

/** Aggregates a set of payment lines against a sale total: how much of the
 * sale is covered (net of surcharges) and how much is left to cover. */
export function summarizePayments(
  lines: PaymentLineLike[],
  methods: PaymentMethodLike[] | undefined,
  total: number,
): PaymentsSummary {
  const paidNet = lines.reduce((sum, line) => sum + netAmountFor(line, methods), 0)
  const remaining = Math.round((total - paidNet) * 100) / 100
  return { paidNet, remaining, isBalanced: Math.abs(remaining) < 0.005 }
}
