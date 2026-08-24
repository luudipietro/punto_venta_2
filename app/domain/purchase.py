from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal


@dataclass(slots=True)
class Purchase:
    branch_id: int
    supplier_name: str | None
    subtotal: Decimal
    total: Decimal
    payment_method_id: int | None = None
    payment_date: date | None = None
    is_paid: bool = False
    cancelled_at: datetime | None = None
    id: int | None = None
