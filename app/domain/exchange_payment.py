from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class ExchangePayment:
    payment_method_id: int
    amount: Decimal
    exchange_id: int | None = None
    id: int | None = None
