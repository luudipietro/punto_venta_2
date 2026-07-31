from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class PaymentMethod:
    name: str
    surcharge_percentage: Decimal = Decimal("0")
    id: int | None = None
