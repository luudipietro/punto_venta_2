from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class SaleItem:
    stock_id: int
    quantity: int
    unit_price: Decimal
    promotion_id: int | None = None
    sale_id: int | None = None
    id: int | None = None
