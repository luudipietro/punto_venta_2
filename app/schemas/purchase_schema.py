from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PurchaseItemInput(BaseModel):
    stock_id: int
    quantity: int = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)


class PurchaseCreate(BaseModel):
    branch_id: int
    supplier_name: str | None = None
    items: list[PurchaseItemInput] = Field(min_length=1)
    payment_method_id: int | None = None
    payment_date: date | None = None


class PurchasePayInput(BaseModel):
    payment_method_id: int
    payment_date: date | None = None


class PurchaseItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    purchase_id: int
    stock_id: int
    quantity: int
    unit_cost: Decimal


class PurchaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    branch_id: int
    supplier_name: str | None
    subtotal: Decimal
    total: Decimal
    payment_method_id: int | None = None
    payment_date: date | None = None
    is_paid: bool = False
    cancelled_at: datetime | None = None


class PurchaseDetailRead(PurchaseRead):
    items: list[PurchaseItemRead]
