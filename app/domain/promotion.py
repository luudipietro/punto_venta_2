from dataclasses import dataclass
from datetime import date
from enum import StrEnum


class DiscountType(StrEnum):
    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"


@dataclass(slots=True)
class Promotion:
    name: str
    start_date: date
    end_date: date
    active: bool = True
    id: int | None = None
