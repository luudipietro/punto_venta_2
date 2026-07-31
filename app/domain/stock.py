from dataclasses import dataclass


@dataclass(slots=True)
class Stock:
    product_id: int
    color_id: int
    size_id: int
    branch_id: int
    quantity: int
    id: int | None = None
