from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class Product:
    name: str
    category_id: int
    brand_id: int
    cost: Decimal
    price: Decimal
    description: str | None = None
    image_url: str | None = None
    id: int | None = None
