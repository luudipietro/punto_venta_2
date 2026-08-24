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
