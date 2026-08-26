from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass(slots=True)
class PaymentMethodBreakdown:
    payment_method_id: int
    name: str
    sales_amount: Decimal
    purchases_amount: Decimal
    expenses_amount: Decimal
    exchanges_amount: Decimal


@dataclass(slots=True)
class DailySeriesPoint:
    date: date
    sales: Decimal
    purchases: Decimal
    expenses: Decimal


@dataclass(slots=True)
class FinancialSummary:
    """Read-only aggregate over an arbitrary date range (and optionally a
    single branch, or all branches when `branch_id` is None) — never
    persisted, same "compose in memory" approach as DailyBalance, just
    generalized from one calendar day to an arbitrary range."""

    start_date: date
    end_date: date
    sales_total: Decimal
    purchases_total: Decimal
    expenses_total: Decimal
    net_cash_balance: Decimal
    payment_method_breakdown: list[PaymentMethodBreakdown] = field(default_factory=list)
    daily_series: list[DailySeriesPoint] = field(default_factory=list)
