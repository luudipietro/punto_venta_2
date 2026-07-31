from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ExchangeItemInput(BaseModel):
    stock_id: int
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(ge=0)


class ExchangePaymentInput(BaseModel):
    payment_method_id: int
    amount: Decimal


class ExchangeCreate(BaseModel):
    sale_id: int
    returned_items: list[ExchangeItemInput] = Field(min_length=1)
    new_items: list[ExchangeItemInput] = Field(default_factory=list)
    payments: list[ExchangePaymentInput] = Field(default_factory=list)


class ExchangeReturnItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exchange_id: int
    stock_id: int
    quantity: int
    unit_price: Decimal


class ExchangeNewItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exchange_id: int
    stock_id: int
    quantity: int
    unit_price: Decimal


class ExchangePaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exchange_id: int
    payment_method_id: int
    amount: Decimal


class ExchangeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sale_id: int


class ExchangeDetailRead(ExchangeRead):
    returned_items: list[ExchangeReturnItemRead]
    new_items: list[ExchangeNewItemRead]
    payments: list[ExchangePaymentRead]
