from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class Sale:
    branch_id: int
    subtotal: Decimal
    discount: Decimal
    total: Decimal
    promotion_discount: Decimal = Decimal("0")
    discount_reason: str | None = None
    id: int | None = None
