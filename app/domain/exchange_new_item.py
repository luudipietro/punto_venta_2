from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class ExchangeNewItem:
    stock_id: int
    quantity: int
    unit_price: Decimal
    exchange_id: int | None = None
    id: int | None = None
