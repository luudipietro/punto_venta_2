from dataclasses import dataclass
from decimal import Decimal

from app.domain.promotion import DiscountType


@dataclass(slots=True)
class PromotionItem:
    """min_quantity is the trigger threshold (how many of the target must be
    in the cart for this line to count as satisfied); max_quantity caps how
    many units actually get discounted once triggered (None = discount the
    full matched quantity in the cart). They're separate so a plain "10% off
    shirts" line (max_quantity=None) discounts every shirt bought, while a
    gift line like "buy 1 shirt, get 1 pair of socks free" (max_quantity=1)
    only discounts a single pair even if more are in the cart."""

    promotion_id: int | None
    discount_type: DiscountType
    discount_value: Decimal
    product_id: int | None = None
    category_id: int | None = None
    min_quantity: int = 1
    max_quantity: int | None = None
    id: int | None = None
