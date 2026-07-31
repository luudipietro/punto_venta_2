from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class Sale:
    branch_id: int
    subtotal: Decimal
    discount: Decimal
    total: Decimal
    id: int | None = None
