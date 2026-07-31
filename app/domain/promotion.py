from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum


class DiscountType(StrEnum):
    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"


@dataclass(slots=True)
class Promotion:
    name: str
    discount_type: DiscountType
    discount_value: Decimal
    start_date: date
    end_date: date
    active: bool = True
    product_id: int | None = None
    category_id: int | None = None
    id: int | None = None
