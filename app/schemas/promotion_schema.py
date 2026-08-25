from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.promotion import DiscountType


class PromotionItemInput(BaseModel):
    product_id: int | None = None
    category_id: int | None = None
    discount_type: DiscountType
    discount_value: Decimal
    min_quantity: int = Field(default=1, gt=0)
    max_quantity: int | None = Field(default=None, gt=0)


class PromotionCreate(BaseModel):
    name: str
    start_date: date
    end_date: date | None = None
    active: bool = True
    items: list[PromotionItemInput] = Field(min_length=1)


class PromotionUpdate(PromotionCreate):
    pass


class PromotionItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    promotion_id: int
    product_id: int | None
    category_id: int | None
    discount_type: DiscountType
    discount_value: Decimal
    min_quantity: int
    max_quantity: int | None


class PromotionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    start_date: date
    end_date: date | None
    active: bool


class PromotionDetailRead(PromotionRead):
    items: list[PromotionItemRead]
