from dataclasses import dataclass


@dataclass(slots=True)
class Stock:
    product_id: int
    branch_id: int
    quantity: int
    color_id: int | None = None
    size_id: int | None = None
    id: int | None = None
