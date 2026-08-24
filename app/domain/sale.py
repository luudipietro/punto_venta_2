from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass(slots=True)
class Sale:
    branch_id: int
    subtotal: Decimal
    discount: Decimal
    total: Decimal
    promotion_discount: Decimal = Decimal("0")
    discount_reason: str | None = None
    customer_id: int | None = None
    id: int | None = None
    created_at: datetime | None = None
    cancelled_at: datetime | None = None
