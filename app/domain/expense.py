from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(slots=True)
class Expense:
    branch_id: int
    payment_method_id: int
    amount: Decimal
    description: str
    date: date
    id: int | None = None
