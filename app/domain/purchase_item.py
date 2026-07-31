from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class PurchaseItem:
    stock_id: int
    quantity: int
    unit_cost: Decimal
    purchase_id: int | None = None
    id: int | None = None
