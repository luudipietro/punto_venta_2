from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class DailyBalanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    sales_cash_total: Decimal
    sales_total: Decimal
    expenses_cash_total: Decimal
    purchases_cash_total: Decimal
    exchanges_cash_total: Decimal
    balance: Decimal


class PaymentMethodBreakdownRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    payment_method_id: int
    name: str
    sales_amount: Decimal
    purchases_amount: Decimal
    expenses_amount: Decimal
    exchanges_amount: Decimal


class DailySeriesPointRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    sales: Decimal
    purchases: Decimal
    expenses: Decimal


class FinancialSummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    start_date: date
    end_date: date
    sales_total: Decimal
    purchases_total: Decimal
    expenses_total: Decimal
    net_cash_balance: Decimal
    payment_method_breakdown: list[PaymentMethodBreakdownRead]
    daily_series: list[DailySeriesPointRead]
