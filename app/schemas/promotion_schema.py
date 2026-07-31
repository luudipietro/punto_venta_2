from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.domain.promotion import DiscountType


class PromotionBase(BaseModel):
    name: str
    discount_type: DiscountType
    discount_value: Decimal
    start_date: date
    end_date: date
    active: bool = True
    product_id: int | None = None
    category_id: int | None = None


class PromotionCreate(PromotionBase):
    pass


class PromotionUpdate(PromotionBase):
    pass


class PromotionRead(PromotionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
