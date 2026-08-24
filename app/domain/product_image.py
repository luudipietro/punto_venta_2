from dataclasses import dataclass


@dataclass(slots=True)
class ProductImage:
    product_id: int
    url: str
    id: int | None = None
