from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class Product:
    name: str
    cost: Decimal
    price: Decimal
    category_id: int | None = None
    brand_id: int | None = None
    description: str | None = None
    image_url: str | None = None
    id: int | None = None
