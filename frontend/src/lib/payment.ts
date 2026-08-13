/** A payment method's surcharge_percentage (e.g. 5 for 5%) applied to the
 * amount charged through it — the resulting `amount_with_surcharge` is what
 * the backend expects alongside the pre-surcharge amount on each SalePayment. */
export function applySurcharge(amount: number, surchargePercentage: number): number {
  return Math.round(amount * (1 + surchargePercentage / 100) * 100) / 100
}
