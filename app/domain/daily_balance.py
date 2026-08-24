from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(slots=True)
class DailyBalance:
    """A read-only aggregate for one calendar day at one branch — never
    persisted, computed on the fly by ReportService from Sale/Expense data."""

    date: date
    sales_cash_total: Decimal
    sales_total: Decimal
    expenses_cash_total: Decimal
    purchases_cash_total: Decimal
    exchanges_cash_total: Decimal
    balance: Decimal
