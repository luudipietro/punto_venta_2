from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SaleItemInput(BaseModel):
    stock_id: int
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(ge=0)


class SalePaymentInput(BaseModel):
    payment_method_id: int
    amount_without_surcharge: Decimal = Field(ge=0)
    amount_with_surcharge: Decimal = Field(ge=0)


class SaleCreate(BaseModel):
    branch_id: int
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    items: list[SaleItemInput] = Field(min_length=1)
    payments: list[SalePaymentInput] = Field(min_length=1)


class SaleItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sale_id: int
    stock_id: int
    quantity: int
    unit_price: Decimal


class SalePaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sale_id: int
    payment_method_id: int
    amount_without_surcharge: Decimal
    amount_with_surcharge: Decimal


class SaleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    branch_id: int
    subtotal: Decimal
    discount: Decimal
    total: Decimal


class SaleDetailRead(SaleRead):
    items: list[SaleItemRead]
    payments: list[SalePaymentRead]
