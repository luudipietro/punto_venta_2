from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class Purchase:
    branch_id: int
    supplier_name: str | None
    subtotal: Decimal
    total: Decimal
    id: int | None = None
