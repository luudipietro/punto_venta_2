from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class SalePayment:
    payment_method_id: int
    amount_without_surcharge: Decimal
    amount_with_surcharge: Decimal
    sale_id: int | None = None
    id: int | None = None
