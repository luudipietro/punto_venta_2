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
    # Storefront-only visibility toggles — irrelevant to the POS itself (a
    # hidden/price-hidden product still sells normally at the register).
    hidden_from_storefront: bool = False
    price_hidden_from_storefront: bool = False
    id: int | None = None
